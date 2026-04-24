import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireParticipantSession } from '@/lib/server/participant-session';
import { getSubmissionImagesPublicBaseUrl } from '@/lib/supabase/config';
import { checkRateLimit, rateLimitResponse } from '@/lib/utils/rate-limit';

const submissionSchema = z.object({
  participantId: z.string().uuid(),
  sessionId: z.string().uuid(),
  stepId: z.string().uuid(),
  content: z.string().max(10000).optional().default(''),
  imageUrl: z.string().url().max(2000).optional().nullable(),
}).refine(
  (data) => data.content.trim().length > 0 || (data.imageUrl != null && data.imageUrl.length > 0),
  { message: 'Either text content or an image is required' }
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = submissionSchema.parse(body);

    const rl = checkRateLimit(`sub:${validatedData.participantId}`, 20, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

    const auth = await requireParticipantSession(request, {
      participantId: validatedData.participantId,
      sessionId: validatedData.sessionId,
    });
    if (auth.response) {
      return auth.response;
    }

    const supabase = await createServiceClient();
    const [participantResult, stepResult] = await Promise.all([
      supabase
        .from('participants')
        .select('id')
        .eq('id', validatedData.participantId)
        .eq('session_id', validatedData.sessionId)
        .single(),
      supabase
        .from('session_snapshot_steps')
        .select('id')
        .eq('id', validatedData.stepId)
        .eq('session_id', validatedData.sessionId)
        .single(),
    ]);

    if (!participantResult.data) {
      return NextResponse.json(
        { success: false, error: 'Participant not found in session' },
        { status: 403 }
      );
    }

    if (!stepResult.data) {
      return NextResponse.json(
        { success: false, error: 'Step not found in session' },
        { status: 400 }
      );
    }

    if (validatedData.imageUrl) {
      const allowedPrefix = `${getSubmissionImagesPublicBaseUrl()}/${validatedData.sessionId}/${validatedData.participantId}/${validatedData.stepId}.`;
      if (!validatedData.imageUrl.startsWith(allowedPrefix)) {
        return NextResponse.json(
          { success: false, error: 'Image URL does not belong to this submission' },
          { status: 400 }
        );
      }
    }

    const { data: submission, error } = await supabase
      .from('submissions')
      .upsert(
        {
          participant_id: validatedData.participantId,
          session_id: validatedData.sessionId,
          step_id: validatedData.stepId,
          content: validatedData.content,
          image_url: validatedData.imageUrl ?? null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'participant_id,step_id',
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Submission error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to save submission' },
        { status: 500 }
      );
    }

    await supabase
      .from('participants')
      .update({
        current_step_id: validatedData.stepId,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', validatedData.participantId)
      .eq('session_id', validatedData.sessionId);

    return NextResponse.json({
      success: true,
      submission: {
        id: submission.id,
        step_id: submission.step_id,
        content: submission.content,
        image_url: submission.image_url,
        updated_at: submission.updated_at,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }

    console.error('Submission error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
