import { createClient as createServerClient } from '@/lib/supabase/server';
import { Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import Link from 'next/link';

export default async function ModulesPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: facilitator } = await supabase
    .from('facilitator_users')
    .select('organization_id')
    .eq('user_id', user?.id || '')
    .single();

  const orgId = facilitator?.organization_id;

  const { data: templates, error } = await supabase
    .from('workshop_templates')
    .select(`
      id,
      name,
      modules(
        id,
        title,
        objective,
        order_index,
        steps:module_steps(id)
      )
    `)
    .eq('organization_id', orgId || '')
    .order('name');

  if (error) {
    console.error('Modules page query error:', error);
    return (
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Modules</h1>
          </div>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <Layers className="w-12 h-12 mx-auto mb-4 text-red-400" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Modules</h3>
            <p className="text-gray-600">Something went wrong while loading modules. Please try refreshing the page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  interface NormalizedModule {
    id: string;
    title: string;
    objective: string | null;
    order_index: number;
    step_count: number;
  }

  interface NormalizedTemplate {
    id: string;
    name: string;
    modules: NormalizedModule[];
  }

  const normalizedTemplates: NormalizedTemplate[] = (templates || []).map(t => ({
    id: t.id,
    name: t.name,
    modules: ((t.modules as { id: string; title: string; objective: string | null; order_index: number; steps: { id: string }[] }[]) || [])
      .sort((a, b) => a.order_index - b.order_index)
      .map((m) => ({
        id: m.id,
        title: m.title,
        objective: m.objective,
        order_index: m.order_index,
        step_count: Array.isArray(m.steps) ? m.steps.length : 0,
      })),
  }));

  const totalModules = normalizedTemplates.reduce((sum, t) => sum + t.modules.length, 0);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Modules</h1>
          <p className="text-white/80">
            {totalModules} module{totalModules !== 1 ? 's' : ''} across {normalizedTemplates.length} template{normalizedTemplates.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {totalModules === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Layers className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Modules Yet</h3>
            <p className="text-gray-600 mb-6">
              Modules are created inside templates. Create a template first, then add modules to it.
            </p>
            <Link
              href="/admin/templates"
              className="text-brand-600 hover:underline font-medium"
            >
              Go to Templates
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {normalizedTemplates.filter(t => t.modules.length > 0).map((template) => (
            <div key={template.id}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  {template.name}
                </h2>
                <Link
                  href={`/admin/templates/${template.id}`}
                  className="text-xs text-brand-600 hover:text-brand-700"
                >
                  Edit Template
                </Link>
              </div>
              <div className="grid gap-3">
                {template.modules.map((mod) => (
                  <Card key={mod.id} className="hover:shadow-sm transition-shadow">
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center text-sm font-semibold">
                          {mod.order_index + 1}
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900">{mod.title}</h3>
                          {mod.objective && (
                            <p className="text-sm text-gray-500 mt-0.5">{mod.objective}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">
                          {mod.step_count} step{mod.step_count !== 1 ? 's' : ''}
                        </span>
                        <Link
                          href={`/admin/templates/${template.id}`}
                          className="text-xs text-gray-400 hover:text-brand-600 font-medium"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
