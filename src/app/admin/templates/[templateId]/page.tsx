import { createClient as createServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TemplateEditor } from './TemplateEditor';

interface PageProps {
  params: Promise<{ templateId: string }>;
}

export default async function TemplateDetailPage({ params }: PageProps) {
  const { templateId } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: facilitator } = await supabase
    .from('facilitator_users')
    .select('organization_id')
    .eq('user_id', user?.id || '')
    .single();

  // Fetch template with nested structure
  const { data: template, error } = await supabase
    .from('workshop_templates')
    .select(`
      id,
      name,
      description,
      estimated_duration_minutes,
      is_published,
      ai_tool_name,
      ai_tool_url,
      organization_id,
      created_at,
      modules(
        id,
        title,
        objective,
        order_index,
        steps:module_steps(
          id,
          title,
          instruction_markdown,
          estimated_minutes,
          is_required,
          order_index,
          ai_tool_name,
          ai_tool_url,
          prompt_blocks(
            id,
            title,
            content_markdown,
            is_copyable,
            order_index
          )
        )
      )
    `)
    .eq('id', templateId)
    .eq('organization_id', facilitator?.organization_id || '')
    .single();

  if (error || !template) {
    notFound();
  }

  // Sort nested arrays by order_index
  const sortedTemplate = {
    ...template,
    modules: ((template.modules as any[]) || [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((mod: any) => ({
        ...mod,
        steps: (mod.steps || [])
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((step: any) => ({
            ...step,
            prompt_blocks: (step.prompt_blocks || [])
              .sort((a: any, b: any) => a.order_index - b.order_index),
          })),
      })),
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/admin/templates"
          className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Templates
        </Link>
      </div>

      <TemplateEditor template={sortedTemplate} />
    </div>
  );
}
