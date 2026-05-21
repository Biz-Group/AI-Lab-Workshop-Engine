import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

// GET: List team members + pending access requests (owner-only)
export async function GET() {
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

    // Fetch team members
    const { data: members, error: membersError } = await serviceClient
      .from('facilitator_users')
      .select('id, user_id, display_name, role, created_at')
      .eq('organization_id', facilitator.organization_id)
      .order('created_at');

    if (membersError) {
      return NextResponse.json({ success: false, error: 'Failed to fetch team members' }, { status: 500 });
    }

    // Fetch pending access requests
    const { data: requests, error: requestsError } = await serviceClient
      .from('access_requests')
      .select('id, user_id, display_name, requested_role, status, created_at')
      .eq('organization_id', facilitator.organization_id)
      .eq('status', 'pending')
      .order('created_at');

    if (requestsError) {
      return NextResponse.json({ success: false, error: 'Failed to fetch requests' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { members, requests } });
  } catch (error) {
    console.error('Team GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

const approveSchema = z.object({
  request_id: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'facilitator']),
});

// POST: Approve a pending access request
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
    const validation = approveSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const { request_id, role } = validation.data;

    // Fetch the access request
    const { data: accessRequest, error: reqError } = await serviceClient
      .from('access_requests')
      .select('id, user_id, organization_id, display_name, status')
      .eq('id', request_id)
      .eq('organization_id', facilitator.organization_id)
      .single();

    if (reqError || !accessRequest) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    }

    if (accessRequest.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'Request already resolved' }, { status: 409 });
    }

    // Create facilitator_users record
    const { error: insertError } = await serviceClient
      .from('facilitator_users')
      .insert({
        user_id: accessRequest.user_id,
        organization_id: accessRequest.organization_id,
        display_name: accessRequest.display_name,
        role,
      });

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ success: false, error: 'User is already a team member' }, { status: 409 });
      }
      console.error('Approve insert error:', insertError);
      return NextResponse.json({ success: false, error: 'Failed to approve request' }, { status: 500 });
    }

    // Update request status
    await serviceClient
      .from('access_requests')
      .update({ status: 'approved', resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq('id', request_id);

    return NextResponse.json({ success: true, data: { approved: true } });
  } catch (error) {
    console.error('Team POST error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

const updateRoleSchema = z.object({
  facilitator_id: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'facilitator']),
});

// PATCH: Update a team member's role
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = await createServiceClient();
    const { data: facilitator } = await serviceClient
      .from('facilitator_users')
      .select('id, organization_id, role, user_id')
      .eq('user_id', user.id)
      .single();

    if (!facilitator) {
      return NextResponse.json({ success: false, error: 'Facilitator not found' }, { status: 403 });
    }

    if (facilitator.role !== 'owner') {
      return NextResponse.json({ success: false, error: 'Only owners can manage team' }, { status: 403 });
    }

    const body = await request.json();
    const validation = updateRoleSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const { facilitator_id, role } = validation.data;

    // Cannot change own role
    if (facilitator_id === facilitator.id) {
      return NextResponse.json({ success: false, error: 'Cannot change your own role' }, { status: 400 });
    }

    const { error: updateError } = await serviceClient
      .from('facilitator_users')
      .update({ role })
      .eq('id', facilitator_id)
      .eq('organization_id', facilitator.organization_id);

    if (updateError) {
      console.error('Role update error:', updateError);
      return NextResponse.json({ success: false, error: 'Failed to update role' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { updated: true } });
  } catch (error) {
    console.error('Team PATCH error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

const deleteSchema = z.object({
  facilitator_id: z.string().uuid(),
});

// DELETE: Remove a team member
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = await createServiceClient();
    const { data: facilitator } = await serviceClient
      .from('facilitator_users')
      .select('id, organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!facilitator) {
      return NextResponse.json({ success: false, error: 'Facilitator not found' }, { status: 403 });
    }

    if (facilitator.role !== 'owner') {
      return NextResponse.json({ success: false, error: 'Only owners can manage team' }, { status: 403 });
    }

    const body = await request.json();
    const validation = deleteSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const { facilitator_id } = validation.data;

    // Cannot remove self
    if (facilitator_id === facilitator.id) {
      return NextResponse.json({ success: false, error: 'Cannot remove yourself' }, { status: 400 });
    }

    const { error: deleteError } = await serviceClient
      .from('facilitator_users')
      .delete()
      .eq('id', facilitator_id)
      .eq('organization_id', facilitator.organization_id);

    if (deleteError) {
      console.error('Remove member error:', deleteError);
      return NextResponse.json({ success: false, error: 'Failed to remove member' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { removed: true } });
  } catch (error) {
    console.error('Team DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
