import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

/**
 * Facilitator moderation for the projected gallery wall.
 *
 * Facilitators have SELECT-only RLS on submissions (002_rls_policies.sql), so
 * the flag is written with the service client after an explicit org check --
 * the same shape as the participant-notes route.
 *
 * Persisted rather than kept in wall-local state on purpose: hiding an
 * inappropriate or private image has to survive a projector refresh to be worth
 * anything.
 */
const moderationSchema = z.object({
  hidden_from_wall: z.boolean(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
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

    const { submissionId } = await params;
    const body = await request.json();
    const validation = moderationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

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

    const { data: submission } = await serviceClient
      .from('submissions')
      .select('id, session:sessions!inner(organization_id)')
      .eq('id', submissionId)
      .single();

    if (!submission) {
      return NextResponse.json(
        { success: false, error: 'Submission not found' },
        { status: 404 }
      );
    }

    const session = submission.session as
      | { organization_id: string }
      | { organization_id: string }[]
      | null;
    const sessionOrg = Array.isArray(session) ? session[0]?.organization_id : session?.organization_id;

    if (sessionOrg !== facilitator.organization_id) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    const { error: updateError } = await serviceClient
      .from('submissions')
      .update({ hidden_from_wall: validation.data.hidden_from_wall })
      .eq('id', submissionId);

    if (updateError) {
      console.error('Submission moderation error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update submission' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Submission PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
