import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireParticipantSession } from '@/lib/server/participant-session';

const sessionStateSchema = z.object({
  sessionId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const validation = sessionStateSchema.safeParse({
    sessionId: request.nextUrl.searchParams.get('sessionId'),
  });

  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: 'Valid sessionId is required' },
      { status: 400 }
    );
  }

  const { sessionId } = validation.data;
  const auth = await requireParticipantSession(request, { sessionId });
  if (auth.response) {
    return auth.response;
  }

  try {
    const supabase = await createServiceClient();
    const { data: session, error } = await supabase
      .from('sessions')
      .select('id, status, current_step_id, timer_end_at')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        currentStepId: session.current_step_id,
        timerEndAt: session.timer_end_at,
      },
    });
  } catch (error) {
    console.error('Session state error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
