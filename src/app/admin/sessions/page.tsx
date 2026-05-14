import Link from 'next/link';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { Plus, PlayCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import { getJoinField } from '@/lib/utils/supabase-join';
import { SessionsTable } from './SessionsTable';

export default async function SessionsPage() {
  const supabase = await createServerClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  // Get facilitator's organization
  const { data: facilitator } = await supabase
    .from('facilitator_users')
    .select('organization_id')
    .eq('user_id', user?.id || '')
    .single();

  const orgId = facilitator?.organization_id;

  // Get all sessions with new fields
  const { data: sessions } = await supabase
    .from('sessions')
    .select(`
      id,
      join_code,
      status,
      created_at,
      client_name,
      department,
      location,
      poc_name,
      poc_email,
      event_type,
      event_date,
      template_id,
      template:workshop_templates(name)
    `)
    .eq('organization_id', orgId || '')
    .order('created_at', { ascending: false });

  // Fetch approved clients for the org
  const serviceClient = await createServiceClient();
  const { data: clients } = await serviceClient
    .from('approved_clients')
    .select('id, name, poc_name, poc_email')
    .eq('organization_id', orgId || '')
    .order('name');

  // Normalize for client component
  const normalizedSessions = (sessions || []).map((s) => ({
    id: s.id,
    join_code: s.join_code,
    status: s.status as string,
    created_at: s.created_at,
    client_name: s.client_name as string | null,
    department: s.department as string | null,
    location: s.location as string | null,
    poc_name: s.poc_name as string | null,
    poc_email: s.poc_email as string | null,
    event_type: s.event_type as string | null,
    event_date: s.event_date as string | null,
    template_id: s.template_id as string,
    template_name: getJoinField(s.template, 'name') as string || 'Unknown Template',
  }));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Sessions</h1>
          <p className="text-white/80">View and manage your workshop sessions</p>
        </div>
        <Link 
          href="/admin/sessions/new"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Start New Session
        </Link>
      </div>

      {normalizedSessions.length > 0 ? (
        <SessionsTable sessions={normalizedSessions} clients={clients || []} />
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <PlayCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Sessions Yet
            </h3>
            <p className="text-gray-600 mb-6">
              Start your first workshop session to engage with participants.
            </p>
            <Link 
              href="/admin/sessions/new"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Start New Session
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
