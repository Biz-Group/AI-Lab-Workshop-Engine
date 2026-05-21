import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const denySchema = z.object({
  request_id: z.string().uuid(),
});

// POST: Deny a pending access request
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = await createServiceClient();
    const { data: facilitator } = await serviceClient
      .from('facilitator_users')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!facilitator) {
      return NextResponse.json({ success: false, error: 'Facilitator not found' }, { status: 403 });
    }

    if (facilitator.role !== 'owner') {
      return NextResponse.json({ success: false, error: 'Only owners can manage team' }, { status: 403 });
    }

    const body = await request.json();
    const validation = denySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const { request_id } = validation.data;

    // Verify request belongs to this org and is pending
    const { data: accessRequest, error: reqError } = await serviceClient
      .from('access_requests')
      .select('id, status')
      .eq('id', request_id)
      .eq('organization_id', facilitator.organization_id)
      .single();

    if (reqError || !accessRequest) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    }

    if (accessRequest.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'Request already resolved' }, { status: 409 });
    }

    // Deny the request
    const { error: updateError } = await serviceClient
      .from('access_requests')
      .update({ status: 'denied', resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq('id', request_id);

    if (updateError) {
      console.error('Deny request error:', updateError);
      return NextResponse.json({ success: false, error: 'Failed to deny request' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { denied: true } });
  } catch (error) {
    console.error('Team deny POST error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
