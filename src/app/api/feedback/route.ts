import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireParticipantSession } from '@/lib/server/participant-session';
import { checkRateLimit, rateLimitResponse } from '@/lib/utils/rate-limit';

const feedbackSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  feedback: z.string().min(10, 'Feedback must be at least 10 characters').max(3000, 'Feedback is too long'),
  mostValuable: z.string().max(2000, 'Most valuable response is too long').optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validation = feedbackSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: validation.error.errors[0].message 
        },
        { status: 400 }
      );
    }

    const { sessionId, participantId, rating, feedback, mostValuable } = validation.data;

    const auth = await requireParticipantSession(request, { participantId, sessionId });
    if (auth.response) {
      return auth.response;
    }

    // Rate limit: 5 feedback submissions per minute per participant
    const rl = await checkRateLimit(`fb:${participantId}`, 5, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

    const supabase = await createServiceClient();

    // Verify participant exists and belongs to session
    const { data: participant, error: participantError } = await supabase
      .from('participants')
      .select('id, session_id, feedback_submitted')
      .eq('id', participantId)
      .eq('session_id', sessionId)
      .single();

    if (participantError || !participant) {
      return NextResponse.json(
        { success: false, error: 'Participant not found' },
        { status: 404 }
      );
    }

    // Check if feedback already submitted
    if (participant.feedback_submitted) {
      return NextResponse.json(
        { success: false, error: 'Feedback already submitted' },
        { status: 400 }
      );
    }

    // Insert feedback
    const { error: feedbackError } = await supabase
      .from('feedback')
      .insert({
        session_id: sessionId,
        participant_id: participantId,
        rating,
        feedback,
        most_valuable: mostValuable || null,
      });

    if (feedbackError) {
      console.error('Error inserting feedback:', feedbackError);
      return NextResponse.json(
        { success: false, error: 'Failed to save feedback' },
        { status: 500 }
      );
    }

    // Update participant to mark feedback as submitted
    const { error: updateError } = await supabase
      .from('participants')
      .update({ feedback_submitted: true })
      .eq('id', participantId);

    if (updateError) {
      console.error('Error updating participant:', updateError);
      // Continue anyway - feedback was saved
    }

    // Log analytics event
    await supabase.from('analytics_events').insert({
      session_id: sessionId,
      participant_id: participantId,
      event_type: 'feedback_submitted',
      payload: { rating },
    });

    return NextResponse.json({
      success: true,
      message: 'Feedback submitted successfully',
    });
  } catch (error) {
    console.error('Feedback submission error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'An unexpected error occurred' 
      },
      { status: 500 }
    );
  }
}
