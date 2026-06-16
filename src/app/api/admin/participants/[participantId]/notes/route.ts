import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const notesSchema = z.object({
  facilitator_notes: z.string().max(5000),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ participantId: string }> }
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

    const { participantId } = await params;
    const body = await request.json();
    const validation = notesSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    // Verify facilitator has access to this participant's session
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

    // Check participant belongs to a session in this org
    const { data: participant } = await serviceClient
      .from('participants')
      .select('id, session:sessions!inner(organization_id)')
      .eq('id', participantId)
      .single();

    if (!participant) {
      return NextResponse.json(
        { success: false, error: 'Participant not found' },
        { status: 404 }
      );
    }

    const session = participant.session as { organization_id: string } | { organization_id: string }[] | null;
    const sessionOrg = Array.isArray(session) ? session[0]?.organization_id : session?.organization_id;
    if (sessionOrg !== facilitator.organization_id) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    const { error: updateError } = await serviceClient
      .from('participants')
      .update({ facilitator_notes: validation.data.facilitator_notes })
      .eq('id', participantId);

    if (updateError) {
      console.error('Update notes error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to save notes' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Notes PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
