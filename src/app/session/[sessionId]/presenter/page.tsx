import { redirect, notFound } from 'next/navigation';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { PresenterView } from '@/components/presenter/PresenterView';
import { getJoinField } from '@/lib/utils/supabase-join';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function PresenterPage({ params }: PageProps) {
  const { sessionId } = await params;
  const supabase = await createServerClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/auth/login');
  }

  // Verify facilitator owns this session
  const { data: facilitator } = await supabase
    .from('facilitator_users')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!facilitator) {
    notFound();
  }

  // Fetch session, modules, and participant count in parallel
  const [sessionResult, modulesResult, countResult] = await Promise.all([
    supabase
      .from('sessions')
      .select(`
        id,
        join_code,
        status,
        current_step_id,
        timer_end_at,
        organization:organizations(name),
        template:workshop_templates(name)
      `)
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
          order_index,
          estimated_minutes,
          is_required,
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

  const modules = modulesResult.data;
  const participantCount = countResult.count;

  // Sort steps within modules
  const sortedModules = modules?.map(module => ({
    ...module,
    steps: module.steps?.sort((a, b) => a.order_index - b.order_index),
  })).sort((a, b) => a.order_index - b.order_index);

  return (
    <PresenterView
      session={{
        id: session.id,
        joinCode: session.join_code,
        status: session.status,
        currentStepId: session.current_step_id,
        timerEndAt: session.timer_end_at,
        organizationName: getJoinField(session.organization, 'name') || '',
        templateName: getJoinField(session.template, 'name') || '',
      }}
      modules={sortedModules || []}
      initialParticipantCount={participantCount || 0}
    />
  );
}
