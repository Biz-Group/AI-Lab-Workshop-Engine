import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { z } from 'zod';

const eventSchema = z.object({
  participantId: z.string().uuid(),
  sessionId: z.string().uuid(),
  eventType: z.enum([
    'join_verified',
    'join_completed',
    'waiting_viewed',
    'step_started',
    'step_viewed',
    'step_completed',
    'step_skipped',
    'prompt_copied',
    'question_asked',
    'session_end_viewed',
    'stuck_signal',
    'chatgpt_opened',
    'pdf_downloaded',
    'email_sent',
    'feedback_submitted',
  ]),
  payload: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = eventSchema.parse(body);

    // Rate limit: 60 events per minute per participant (analytics fires frequently)
    const rl = checkRateLimit(`evt:${validatedData.participantId}`, 60, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: true }); // silent drop for analytics

    const supabase = await createServiceClient();

    const { error } = await supabase
      .from('analytics_events')
      .insert({
        participant_id: validatedData.participantId,
        session_id: validatedData.sessionId,
        event_type: validatedData.eventType,
        payload: validatedData.payload || null,
      });

    if (error) {
      console.error('Analytics event error:', error);
      // Don't fail the request for analytics errors
    }

    // Update participant's last seen
    await supabase
      .from('participants')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', validatedData.participantId);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }
    
    // Still return success for analytics to not break the UI
    console.error('Analytics event error:', err);
    return NextResponse.json({ success: true });
  }
}
