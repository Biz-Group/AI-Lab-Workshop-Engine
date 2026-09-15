import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireParticipantSession } from '@/lib/server/participant-session';
import { getSubmissionImagesPublicBaseUrl } from '@/lib/supabase/config';
import { checkRateLimit, rateLimitResponse } from '@/lib/utils/rate-limit';

/**
 * Lets a participant remove one of their own images.
 *
 * Multi-image gallery steps (see GalleryStepSubmission) needed a real delete
 * for the first time -- previously the only way to "remove" an image was to
 * overwrite it, since there was never more than one row to delete.
 */

const deleteSchema = z.object({
  participantId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await params;
    const body = await request.json();
    const validatedData = deleteSchema.parse(body);

    const rl = await checkRateLimit(`del:${validatedData.participantId}`, 20, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

    const auth = await requireParticipantSession(request, {
      participantId: validatedData.participantId,
      sessionId: validatedData.sessionId,
    });
    if (auth.response) {
      return auth.response;
    }

    const supabase = await createServiceClient();

    const { data: submission } = await supabase
      .from('submissions')
      .select('id, image_url')
      .eq('id', submissionId)
      .eq('participant_id', validatedData.participantId)
      .eq('session_id', validatedData.sessionId)
      .single();

    if (!submission) {
      return NextResponse.json(
        { success: false, error: 'Submission not found' },
        { status: 404 }
      );
    }

    if (submission.image_url) {
      const basePrefix = `${getSubmissionImagesPublicBaseUrl()}/`;
      if (submission.image_url.startsWith(basePrefix)) {
        const storagePath = submission.image_url.slice(basePrefix.length);
        const { error: removeError } = await supabase.storage
          .from('submission-images')
          .remove([storagePath]);
        // Not fatal: an orphaned storage object is a cleanup nit, not a
        // reason to leave the DB row (and its now-broken tile on the wall)
        // behind for the participant to keep seeing.
        if (removeError) {
          console.error('Storage delete error:', removeError);
        }
      }
    }

    const { error: deleteError } = await supabase
      .from('submissions')
      .delete()
      .eq('id', submissionId);

    if (deleteError) {
      console.error('Submission delete error:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Failed to delete submission' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }

    console.error('Submission delete error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
