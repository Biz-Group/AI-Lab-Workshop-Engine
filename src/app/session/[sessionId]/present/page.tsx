import { redirect, notFound } from 'next/navigation';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { ProjectionWall } from '@/components/presenter/ProjectionWall';
import { parseStepInstructions } from '@/lib/utils';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

/**
 * The projected gallery wall: a chrome-free big-screen view of participants'
 * image submissions for one gallery step.
 *
 * Facilitator-only. proxy.ts checks only that an auth cookie exists, never that
 * it is valid, so the real gate is the in-page check below -- cloned from the
 * presenter console.
 */
export default async function PresentPage({ params }: PageProps) {
  const { sessionId } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: facilitator } = await supabase
    .from('facilitator_users')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!facilitator) {
    notFound();
  }

  const [sessionResult, modulesResult, countResult] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, join_code, status, current_step_id')
      .eq('id', sessionId)
      .eq('organization_id', facilitator.organization_id)
      .single(),
    supabase
      .from('session_snapshot_modules')
      .select(`
        id,
        title,
        order_index,
        steps:session_snapshot_steps(
          id,
          title,
          instruction_markdown,
          order_index,
          is_gallery_step,
          reference_image_url
        )
      `)
      .eq('session_id', sessionId)
      .order('order_index'),
    supabase
      .from('participants')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId),
  ]);

  const session = sessionResult.data;
  if (sessionResult.error || !session) {
    notFound();
  }

  // Flatten in presentation order, keeping the module title for context. The
  // wall navigates gallery steps only, but it needs the full ordering to know
  // where the console's current_step_id sits.
  const allSteps = (modulesResult.data ?? [])
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .flatMap((module) =>
      (module.steps ?? [])
        .slice()
        .sort((a, b) => a.order_index - b.order_index)
        .map((step) => ({
          id: step.id,
          title: step.title,
          moduleTitle: module.title,
          isGalleryStep: step.is_gallery_step === true,
          referenceImageUrl: step.reference_image_url ?? null,
          // The wall shows the activity prompt large. Prefer the parsed
          // objective, which is the one-line framing, over the whole markdown.
          prompt:
            parseStepInstructions(step.instruction_markdown || '').objective ||
            step.title,
        }))
    );

  return (
    <ProjectionWall
      session={{
        id: session.id,
        joinCode: session.join_code,
        status: session.status,
        currentStepId: session.current_step_id,
      }}
      steps={allSteps}
      initialParticipantCount={countResult.count || 0}
    />
  );
}
