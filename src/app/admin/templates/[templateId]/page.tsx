import { createClient as createServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TemplateEditor } from './TemplateEditor';

interface PageProps {
  params: Promise<{ templateId: string }>;
}

interface TemplatePromptBlockRow {
  id: string;
  title: string;
  content_markdown: string;
  is_copyable: boolean;
  order_index: number;
}

interface TemplateStepRow {
  id: string;
  title: string;
  instruction_markdown: string;
  estimated_minutes: number | null;
  is_required: boolean;
  order_index: number;
  ai_tool_name: string | null;
  ai_tool_url: string | null;
  show_response_field: boolean;
  prompt_blocks?: TemplatePromptBlockRow[] | null;
}

interface TemplateModuleRow {
  id: string;
  title: string;
  objective: string | null;
  order_index: number;
  steps?: TemplateStepRow[] | null;
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
          show_response_field,
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
    modules: ((template.modules as TemplateModuleRow[] | null) || [])
      .sort((a, b) => a.order_index - b.order_index)
      .map((mod) => ({
        ...mod,
        steps: (mod.steps || [])
          .sort((a, b) => a.order_index - b.order_index)
          .map((step) => ({
            ...step,
            prompt_blocks: (step.prompt_blocks || [])
              .sort((a, b) => a.order_index - b.order_index),
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
