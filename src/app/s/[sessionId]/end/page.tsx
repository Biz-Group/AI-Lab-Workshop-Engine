import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { validateParticipantSession } from '@/lib/utils/session-token';
import { SessionEndClient } from '@/components/workshop/SessionEndClient';
import { getJoinField } from '@/lib/utils/supabase-join';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionEndPage({ params }: PageProps) {
  const { sessionId } = await params;

  // Validate participant token
  const participant = await validateParticipantSession(sessionId);

  if (!participant) {
    redirect('/join');
  }

  const supabase = await createServiceClient();

  // Fetch session info
  const { data: session } = await supabase
    .from('sessions')
    .select(`
      id,
      client_name,
      organization:organizations(name)
    `)
    .eq('id', sessionId)
    .single();

  // Fetch participant's submissions
  const { data: submissions } = await supabase
    .from('submissions')
    .select(`
      id,
      content,
      step:session_snapshot_steps(
        title,
        module:session_snapshot_modules(title)
      )
    `)
    .eq('participant_id', participant.participant_id);

  // Fetch participant details (for email and feedback status)
  const { data: participantData } = await supabase
    .from('participants')
    .select('id, display_name, email, email_consent, feedback_submitted')
    .eq('id', participant.participant_id)
    .single();

  const formattedSubmissions = submissions?.map(sub => {
    const step = Array.isArray(sub.step) ? sub.step[0] : sub.step;
    const mod = step ? (step as Record<string, unknown>).module : null;
    return {
      id: sub.id,
      content: sub.content,
      stepTitle: getJoinField(sub.step, 'title') || 'Unknown Step',
      moduleTitle: getJoinField(mod, 'title') || 'Unknown Module',
    };
  }) || [];

  return (
    <SessionEndClient
      sessionId={sessionId}
      organizationName={session?.client_name || getJoinField(session?.organization, 'name') || 'Workshop'}
      participantId={participant.participant_id}
      participantName={participant.display_name}
      participantEmail={participantData?.email || null}
      hasEmailConsent={participantData?.email_consent || false}
      feedbackSubmitted={participantData?.feedback_submitted || false}
      submissions={formattedSubmissions}
    />
  );
}
