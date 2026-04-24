import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { readParticipantSession, requireParticipantSession } from '@/lib/server/participant-session';

const sessionQuestionsSchema = z.object({
  sessionId: z.string().uuid(),
});

const createQuestionSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
  questionText: z.string().min(1).max(1000),
});

async function authorizeFacilitatorSessionAccess(sessionId: string) {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      serviceClient: null,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  const serviceClient = await createServiceClient();
  const [{ data: facilitator }, { data: session }] = await Promise.all([
    serviceClient
      .from('facilitator_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .single(),
    serviceClient
      .from('sessions')
      .select('id, organization_id')
      .eq('id', sessionId)
      .single(),
  ]);

  if (!facilitator) {
    return {
      serviceClient: null,
      response: NextResponse.json(
        { success: false, error: 'Facilitator not found' },
        { status: 403 }
      ),
    };
  }

  if (!session || session.organization_id !== facilitator.organization_id) {
    return {
      serviceClient: null,
      response: NextResponse.json(
        { success: false, error: 'Session not found or access denied' },
        { status: 404 }
      ),
    };
  }

  return { serviceClient, response: null };
}

export async function GET(request: NextRequest) {
  try {
    const validation = sessionQuestionsSchema.safeParse({
      sessionId: request.nextUrl.searchParams.get('sessionId'),
    });

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Valid sessionId is required' },
        { status: 400 }
      );
    }

    const { sessionId } = validation.data;
    let serviceClient = await createServiceClient();

    const participantSession = await readParticipantSession(request);
    if (participantSession) {
      if (participantSession.session_id !== sessionId) {
        return NextResponse.json(
          { success: false, error: 'Token mismatch' },
          { status: 403 }
        );
      }
    } else {
      const facilitatorAccess = await authorizeFacilitatorSessionAccess(sessionId);
      if (facilitatorAccess.response) {
        return facilitatorAccess.response;
      }
      serviceClient = facilitatorAccess.serviceClient!;
    }

    const { data: questions, error } = await serviceClient
      .from('session_questions')
      .select('id, session_id, participant_id, participant_name, question_text, answer_text, is_answered, created_at, answered_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch questions error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch questions' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, data: questions },
      {
        headers: {
          'Cache-Control': 'private, max-age=5, stale-while-revalidate=10',
        },
      }
    );
  } catch (error) {
    console.error('Questions GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = createQuestionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { sessionId, participantId, questionText } = validation.data;
    const auth = await requireParticipantSession(request, { participantId, sessionId });
    if (auth.response) {
      return auth.response;
    }

    const serviceClient = await createServiceClient();
    const { data: participant } = await serviceClient
      .from('participants')
      .select('id, display_name')
      .eq('id', participantId)
      .eq('session_id', sessionId)
      .single();

    if (!participant) {
      return NextResponse.json(
        { success: false, error: 'Participant not found in session' },
        { status: 403 }
      );
    }

    const { data: question, error } = await serviceClient
      .from('session_questions')
      .insert({
        session_id: sessionId,
        participant_id: participantId,
        participant_name: participant.display_name,
        question_text: questionText,
      })
      .select()
      .single();

    if (error) {
      console.error('Create question error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to submit question' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: question });
  } catch (error) {
    console.error('Questions POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
