import { redirect, notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import { validateParticipantSession } from '@/lib/utils/session-token';
import { WorkshopRunner } from '@/components/workshop/WorkshopRunner';
import { WaitingForSession } from '@/components/workshop/WaitingForSession';
import { getJoinObject } from '@/lib/utils/supabase-join';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionPage({ params }: PageProps) {
  const { sessionId } = await params;
  
  // Validate participant token
  const participant = await validateParticipantSession(sessionId);
  
  if (!participant) {
    // Redirect to join page if not authenticated
    redirect('/join');
  }

  const supabase = await createServiceClient();

  // Fetch session with snapshots
  const { data: session, error } = await supabase
    .from('sessions')
    .select(`
      id,
      status,
      current_step_id,
      timer_end_at,
      ai_tool_name,
      ai_tool_url,
      organization:organizations(id, name, logo_url),
      template:workshop_templates(name, description)
    `)
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    notFound();
  }

  // Check session status
  if (session.status === 'ended') {
    redirect(`/s/${sessionId}/end`);
  }

  if (session.status === 'published') {
    return (
      <WaitingForSession
        sessionId={sessionId}
        participantId={participant.participant_id}
        participantName={participant.display_name}
        organizationName={getJoinObject<{ id: string; name: string; logo_url: string | null }>(session.organization)?.name || 'Workshop'}
        workshopTitle={getJoinObject<{ name: string; description: string | null }>(session.template)?.name || 'Workshop session'}
        workshopDescription={getJoinObject<{ name: string; description: string | null }>(session.template)?.description || null}
      />
    );
  }

  if (session.status === 'draft') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Session Not Available</h1>
          <p className="text-white/80">This session is not yet available. Please check with your facilitator.</p>
        </div>
      </div>
    );
  }

  // Fetch snapshot modules/steps and submissions in parallel
  const [{ data: modules }, { data: submissions }] = await Promise.all([
    supabase
      .from('session_snapshot_modules')
      .select(`
        id,
        title,
        objective,
        order_index,
        steps:session_snapshot_steps(
          id,
          title,
          instruction_markdown,
          order_index,
          estimated_minutes,
          is_required,
          ai_tool_name,
          ai_tool_url,
          prompt_blocks:session_snapshot_prompt_blocks(
            id,
            title,
            content_markdown,
            order_index,
            is_copyable
          )
        )
      `)
      .eq('session_id', sessionId)
      .order('order_index'),
    supabase
      .from('submissions')
      .select('id, step_id, content, image_url, updated_at')
      .eq('participant_id', participant.participant_id),
  ]);

  // Sort steps within modules
  const sortedModules = modules?.map(module => ({
    ...module,
    steps: module.steps
      ?.sort((a, b) => a.order_index - b.order_index)
      .map(step => ({
        ...step,
        prompt_blocks: step.prompt_blocks?.sort((a, b) => a.order_index - b.order_index),
      })),
  })).sort((a, b) => a.order_index - b.order_index);

  return (
    <WorkshopRunner
      session={{
        id: session.id,
        status: session.status,
        currentStepId: session.current_step_id,
        timerEndAt: session.timer_end_at,
        organization: getJoinObject<{ id: string; name: string; logo_url: string | null }>(session.organization) || { id: '', name: '', logo_url: null },
        template: getJoinObject<{ name: string; description: string | null }>(session.template) || { name: '', description: null },
        aiToolName: session.ai_tool_name ?? 'ChatGPT',
        aiToolUrl: session.ai_tool_url ?? 'https://chat.openai.com',
      }}
      modules={sortedModules || []}
      participant={{
        id: participant.participant_id,
        displayName: participant.display_name,
      }}
      submissions={submissions || []}
    />
  );
}
