import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';

const answerSchema = z.object({
  answerText: z.string().min(1).max(2000),
});

async function authorizeQuestionAccess(questionId: string) {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      question: null,
      serviceClient: null,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  const serviceClient = await createServiceClient();
  const [{ data: facilitator }, { data: question }] = await Promise.all([
    serviceClient
      .from('facilitator_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .single(),
    serviceClient
      .from('session_questions')
      .select('id, session_id')
      .eq('id', questionId)
      .single(),
  ]);

  if (!facilitator) {
    return {
      question: null,
      serviceClient: null,
      response: NextResponse.json(
        { success: false, error: 'Facilitator not found' },
        { status: 403 }
      ),
    };
  }

  if (!question) {
    return {
      question: null,
      serviceClient: null,
      response: NextResponse.json(
        { success: false, error: 'Question not found or access denied' },
        { status: 404 }
      ),
    };
  }

  const { data: session } = await serviceClient
    .from('sessions')
    .select('organization_id')
    .eq('id', question.session_id)
    .single();

  if (!session || session.organization_id !== facilitator.organization_id) {
    return {
      question: null,
      serviceClient: null,
      response: NextResponse.json(
        { success: false, error: 'Question not found or access denied' },
        { status: 404 }
      ),
    };
  }

  return {
    question,
    serviceClient,
    response: null,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  try {
    const { questionId } = await params;
    const body = await request.json();
    const validation = answerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const access = await authorizeQuestionAccess(questionId);
    if (access.response) {
      return access.response;
    }

    const { data: question, error } = await access.serviceClient!
      .from('session_questions')
      .update({
        answer_text: validation.data.answerText,
        is_answered: true,
        answered_at: new Date().toISOString(),
      })
      .eq('id', questionId)
      .select()
      .single();

    if (error) {
      console.error('Answer question error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to answer question' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: question });
  } catch (error) {
    console.error('Question PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  try {
    const { questionId } = await params;
    const access = await authorizeQuestionAccess(questionId);
    if (access.response) {
      return access.response;
    }

    const { error } = await access.serviceClient!
      .from('session_questions')
      .delete()
      .eq('id', questionId);

    if (error) {
      console.error('Delete question error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to delete question' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Question DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
