import { createClient as createServerClient } from '@/lib/supabase/server';
import { FileText, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import Link from 'next/link';
import { TemplatesList } from './TemplatesList';

export default async function TemplatesPage() {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: facilitator } = await supabase
    .from('facilitator_users')
    .select('organization_id')
    .eq('user_id', user?.id || '')
    .single();

  const orgId = facilitator?.organization_id;

  const { data: templates } = await supabase
    .from('workshop_templates')
    .select(`
      id,
      name,
      description,
      estimated_duration_minutes,
      is_published,
      created_at,
      modules(id)
    `)
    .eq('organization_id', orgId || '')
    .order('created_at', { ascending: false });

  const normalizedTemplates = (templates || []).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description as string | null,
    estimated_duration_minutes: t.estimated_duration_minutes as number,
    is_published: t.is_published as boolean,
    created_at: t.created_at,
    module_count: Array.isArray(t.modules) ? t.modules.length : 0,
  }));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Templates</h1>
          <p className="text-white/80">Create and manage workshop templates</p>
        </div>
        <Link
          href="/admin/templates/new"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Template
        </Link>
      </div>

      {normalizedTemplates.length > 0 ? (
        <TemplatesList templates={normalizedTemplates} />
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Templates Yet
            </h3>
            <p className="text-gray-600 mb-6">
              Create your first workshop template to get started.
            </p>
            <Link
              href="/admin/templates/new"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Template
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
