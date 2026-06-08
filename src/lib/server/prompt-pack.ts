import { createServiceClient } from '@/lib/supabase/server';
import type { PromptPackData } from '@/lib/types';
import {
  buildPromptPackDataFromSource,
  mapPromptPackEntries,
  readJoinedName,
} from '@/lib/utils/prompt-pack';

export async function buildPromptPackData(
  sessionId: string,
  participantId: string
): Promise<PromptPackData> {
  const supabase = await createServiceClient();

  const { data: participant, error: participantError } = await supabase
    .from('participants')
    .select('id, display_name, session_id')
    .eq('id', participantId)
    .eq('session_id', sessionId)
    .single();

  if (participantError || !participant) {
    throw new Error('Participant not found');
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select(`
      id,
      ended_at,
      client_name,
      organization:organizations(name),
      workshop_template:workshop_templates(name)
    `)
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error('Session not found');
  }

  const { data: modules, error: modulesError } = await supabase
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
    .order('order_index');

  if (modulesError) {
    throw new Error('Failed to fetch session steps');
  }

  const normalizedModules = (modules ?? []).map((module) => ({
    ...module,
    steps: (module.steps ?? []).sort((a, b) => a.order_index - b.order_index).map((step) => ({
      ...step,
      prompt_blocks: (step.prompt_blocks ?? []).sort((a, b) => a.order_index - b.order_index),
    })),
  }));

  const { data: submissions, error: submissionsError } = await supabase
    .from('submissions')
    .select('step_id, content, image_url, created_at, updated_at')
    .eq('session_id', sessionId)
    .eq('participant_id', participantId);

  if (submissionsError) {
    throw new Error('Failed to fetch participant submissions');
  }

  return buildPromptPackDataFromSource({
    participantName: participant.display_name,
    sessionDate: session.ended_at
      ? new Date(session.ended_at).toLocaleDateString()
      : new Date().toLocaleDateString(),
    organizationName: session.client_name || readJoinedName(session.organization, 'Organization'),
    workshopName: readJoinedName(session.workshop_template, 'Workshop'),
    entries: mapPromptPackEntries(normalizedModules, submissions ?? []),
  });
}
