import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

// GET: List available organizations for the request form
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = await createServiceClient();

    // Check if user already has a facilitator record
    const { data: existing } = await serviceClient
      .from('facilitator_users')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: false, error: 'Already a team member' }, { status: 409 });
    }

    // List organizations (just id and name)
    const { data: orgs, error } = await serviceClient
      .from('organizations')
      .select('id, name')
      .order('name');

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to fetch organizations' }, { status: 500 });
    }

    // Check if user has any pending requests
    const { data: pendingRequests } = await serviceClient
      .from('access_requests')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'pending');

    return NextResponse.json({ success: true, data: { organizations: orgs, pendingRequestOrgs: pendingRequests?.map(r => r.organization_id) || [] } });
  } catch (error) {
    console.error('Request access GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

const requestSchema = z.object({
  organization_id: z.string().uuid(),
  display_name: z.string().min(1, 'Display name is required').max(100),
});

// POST: Submit an access request
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = await createServiceClient();

    // Check if user already has a facilitator record
    const { data: existing } = await serviceClient
      .from('facilitator_users')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: false, error: 'Already a team member' }, { status: 409 });
    }

    const body = await request.json();
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const { organization_id, display_name } = validation.data;

    // Verify organization exists
    const { data: org } = await serviceClient
      .from('organizations')
      .select('id')
      .eq('id', organization_id)
      .single();

    if (!org) {
      return NextResponse.json({ success: false, error: 'Organization not found' }, { status: 404 });
    }

    // Delete any previously denied request to allow re-submission
    await serviceClient
      .from('access_requests')
      .delete()
      .eq('user_id', user.id)
      .eq('organization_id', organization_id)
      .eq('status', 'denied');

    // Insert access request
    const { data: accessRequest, error: insertError } = await serviceClient
      .from('access_requests')
      .insert({
        user_id: user.id,
        organization_id,
        display_name: display_name.trim(),
      })
      .select('id, status, created_at')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ success: false, error: 'You already have a pending request for this organization' }, { status: 409 });
      }
      console.error('Access request insert error:', insertError);
      return NextResponse.json({ success: false, error: 'Failed to submit request' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: accessRequest });
  } catch (error) {
    console.error('Request access POST error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
