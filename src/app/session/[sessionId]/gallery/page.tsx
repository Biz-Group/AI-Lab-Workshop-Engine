import { redirect, notFound } from 'next/navigation';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { SubmissionGallery } from '@/components/presenter/SubmissionGallery';
import { getJoinField } from '@/lib/utils/supabase-join';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function GalleryPage({ params }: PageProps) {
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

  // Fetch session details and snapshot steps
  const [sessionResult, modulesResult] = await Promise.all([
    supabase
      .from('sessions')
      .select(`
        id,
        status,
        join_code,
        client_name,
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
          is_required
        )
      `)
      .eq('session_id', sessionId)
      .order('order_index'),
  ]);

  const session = sessionResult.data;
  if (sessionResult.error || !session) {
    notFound();
  }

  // Sort steps within modules
  const sortedModules = modulesResult.data?.map(module => ({
    ...module,
    steps: module.steps?.sort((a, b) => a.order_index - b.order_index),
  })).sort((a, b) => a.order_index - b.order_index) || [];

  // Flatten to step list with module context
  const steps = sortedModules.flatMap(mod =>
    (mod.steps || []).map(step => ({
      id: step.id,
      title: step.title,
      moduleTitle: mod.title,
      isRequired: step.is_required,
    }))
  );

  return (
    <SubmissionGallery
      session={{
        id: session.id,
        status: session.status,
        joinCode: session.join_code,
        templateName: getJoinField(session.template, 'name') || '',
        organizationName: session.client_name || getJoinField(session.organization, 'name') || '',
      }}
      steps={steps}
    />
  );
}
