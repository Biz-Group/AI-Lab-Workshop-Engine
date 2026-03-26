import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const updateSessionSchema = z.object({
  status: z.enum(['draft', 'published', 'live', 'ended']).optional(),
  current_step_id: z.string().uuid().nullable().optional(),
  timer_end_at: z.string().datetime().nullable().optional(),
  started_at: z.string().datetime().nullable().optional(),
  ended_at: z.string().datetime().nullable().optional(),
  client_name: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  poc_name: z.string().max(200).optional(),
  poc_email: z.string().email().max(200).optional(),
  event_type: z.enum(['keynote', 'halfday', 'fullday']).optional(),
  event_date: z.string().datetime().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const supabase = await createServerClient();

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get session ID from params
    const { sessionId } = await params;

    // Validate request body
    const body = await request.json();
    const validation = updateSessionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const updates = validation.data;

    // Verify user has access to this session via their organization
    const serviceClient = await createServiceClient();

    const { data: facilitator } = await serviceClient
      .from('facilitator_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!facilitator) {
      return NextResponse.json(
        { success: false, error: 'Facilitator not found' },
        { status: 403 }
      );
    }

    const { data: session, error: sessionError } = await serviceClient
      .from('sessions')
      .select('id, organization_id')
      .eq('id', sessionId)
      .eq('organization_id', facilitator.organization_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    // Update session
    const { error: updateError } = await serviceClient
      .from('sessions')
      .update({
        ...(updates.status && { status: updates.status }),
        ...(updates.current_step_id !== undefined && { current_step_id: updates.current_step_id }),
        ...(updates.timer_end_at !== undefined && { timer_end_at: updates.timer_end_at }),
        ...(updates.started_at && { started_at: updates.started_at }),
        ...(updates.ended_at && { ended_at: updates.ended_at }),
        ...(updates.client_name !== undefined && { client_name: updates.client_name }),
        ...(updates.department !== undefined && { department: updates.department }),
        ...(updates.location !== undefined && { location: updates.location }),
        ...(updates.poc_name !== undefined && { poc_name: updates.poc_name }),
        ...(updates.event_type !== undefined && { event_type: updates.event_type }),
        ...(updates.event_date !== undefined && { event_date: updates.event_date }),
      })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Session update error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Session PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const supabase = await createServerClient();

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { sessionId } = await params;

    // Two-step access check for GET
    const serviceClient = await createServiceClient();

    const { data: facilitator } = await serviceClient
      .from('facilitator_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!facilitator) {
      return NextResponse.json(
        { success: false, error: 'Facilitator not found' },
        { status: 403 }
      );
    }

    const { data: session, error } = await serviceClient
      .from('sessions')
      .select(`
        id,
        join_code,
        status,
        current_step_id,
        timer_end_at,
        started_at,
        ended_at,
        created_at,
        organization_id,
        organization:organizations(
          id,
          name
        ),
        workshop_template:workshop_templates(
          id,
          name
        )
      `)
      .eq('id', sessionId)
      .eq('organization_id', facilitator.organization_id)
      .single();

    if (error || !session) {
      return NextResponse.json(
        { success: false, error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    // Get participant count
    const { count: participantCount } = await serviceClient
      .from('participants')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    return NextResponse.json({
      success: true,
      data: {
        ...session,
        participant_count: participantCount || 0,
      },
    });
  } catch (error) {
    console.error('Session GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const supabase = await createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { sessionId } = await params;

    // Two-step access check: get user's org, then verify session belongs to it
    const serviceClient = await createServiceClient();

    const { data: facilitator } = await serviceClient
      .from('facilitator_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!facilitator) {
      return NextResponse.json(
        { success: false, error: 'Facilitator not found' },
        { status: 403 }
      );
    }

    const { data: session, error: sessionError } = await serviceClient
      .from('sessions')
      .select('id, organization_id')
      .eq('id', sessionId)
      .eq('organization_id', facilitator.organization_id)
      .single();

    if (sessionError || !session) {
      console.error('Session lookup error:', sessionError);
      return NextResponse.json(
        { success: false, error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    // Delete in order respecting foreign keys
    await serviceClient.from('analytics_events').delete().eq('session_id', sessionId);
    await serviceClient.from('submissions').delete().eq('session_id', sessionId);
    await serviceClient.from('feedback').delete().eq('session_id', sessionId);
    await serviceClient.from('participants').delete().eq('session_id', sessionId);
    await serviceClient.from('session_snapshot_prompt_blocks').delete().eq('session_id', sessionId);
    await serviceClient.from('session_snapshot_steps').delete().eq('session_id', sessionId);
    await serviceClient.from('session_snapshot_modules').delete().eq('session_id', sessionId);

    const { error: deleteError } = await serviceClient
      .from('sessions')
      .delete()
      .eq('id', sessionId);

    if (deleteError) {
      console.error('Session delete error:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Failed to delete session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Session DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}