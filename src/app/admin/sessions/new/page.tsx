import { redirect } from 'next/navigation';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { NewSessionForm } from './NewSessionForm';

export default async function NewSessionPage() {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Get facilitator's organization
  const { data: facilitator } = await supabase
    .from('facilitator_users')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();

  if (!facilitator) {
    redirect('/admin');
  }

  const serviceClient = await createServiceClient();

  // Get available templates for this organization
  const { data: templates } = await serviceClient
    .from('workshop_templates')
    .select('id, name, description, estimated_duration_minutes')
    .eq('organization_id', facilitator.organization_id)
    .eq('is_published', true)
    .order('name');

  // Get approved clients for this organization
  const { data: clients } = await serviceClient
    .from('approved_clients')
    .select('id, name, poc_name, poc_email')
    .eq('organization_id', facilitator.organization_id)
    .order('name');

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Start New Session</h1>
        <p className="text-white/80">Fill in the session details to create a new workshop</p>
      </div>
      <NewSessionForm templates={templates || []} clients={clients || []} />
    </div>
  );
}
