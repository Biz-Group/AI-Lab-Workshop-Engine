import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const addUserSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'facilitator']),
  display_name: z.string().min(1, 'Display name is required').max(100),
});

// POST: Directly add a registered user to the team (owner-only)
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
    const validation = addUserSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const { user_id, role, display_name } = validation.data;

    // Verify the target user exists in auth
    const { data: { user: targetUser }, error: userError } = await serviceClient.auth.admin.getUserById(user_id);
    if (userError || !targetUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Insert facilitator record
    const { data: newMember, error: insertError } = await serviceClient
      .from('facilitator_users')
      .insert({
        user_id,
        organization_id: facilitator.organization_id,
        display_name: display_name.trim(),
        role,
      })
      .select('id')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ success: false, error: 'User is already a team member' }, { status: 409 });
      }
      console.error('Add user error:', insertError);
      return NextResponse.json({ success: false, error: 'Failed to add user' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { id: newMember.id } });
  } catch (error) {
    console.error('Team add POST error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
