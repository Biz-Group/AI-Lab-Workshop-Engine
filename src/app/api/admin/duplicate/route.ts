import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const duplicateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('template'),
    template_id: z.string().uuid(),
  }),
  z.object({
    type: z.literal('module'),
    module_id: z.string().uuid(),
  }),
  z.object({
    type: z.literal('step'),
    step_id: z.string().uuid(),
    target_module_id: z.string().uuid(),
  }),
  z.object({
    type: z.literal('prompt_block'),
    block_id: z.string().uuid(),
    target_step_id: z.string().uuid(),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = duplicateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // Get user's org
    const { data: facilitator } = await serviceClient
      .from('facilitator_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!facilitator) {
      return NextResponse.json({ success: false, error: 'Facilitator not found' }, { status: 403 });
    }

    const payload = validation.data;

    // ── Duplicate Template ──────────────────────────────────────────
    if (payload.type === 'template') {
      const { data: tmpl } = await serviceClient
        .from('workshop_templates')
        .select(`
          name, description, estimated_duration_minutes, is_published, ai_tool_name, ai_tool_url,
          modules(
            title, objective, order_index,
            steps:module_steps(
              title, instruction_markdown, estimated_minutes, is_required, order_index, ai_tool_name, ai_tool_url,
              prompt_blocks(title, content_markdown, is_copyable, order_index)
            )
          )
        `)
        .eq('id', payload.template_id)
        .eq('organization_id', facilitator.organization_id)
        .single();

      if (!tmpl) {
        return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
      }

      const { data: newTmpl, error: tmplErr } = await serviceClient
        .from('workshop_templates')
        .insert({
          name: `${tmpl.name} (Copy)`,
          description: tmpl.description,
          estimated_duration_minutes: tmpl.estimated_duration_minutes,
          is_published: false,
          ai_tool_name: tmpl.ai_tool_name,
          ai_tool_url: tmpl.ai_tool_url,
          organization_id: facilitator.organization_id,
        })
        .select('id')
        .single();

      if (tmplErr || !newTmpl) {
        return NextResponse.json({ success: false, error: 'Failed to duplicate template' }, { status: 500 });
      }

      // Deep copy modules → steps → blocks
      const modules = ((tmpl.modules as any[]) || []).sort((a: any, b: any) => a.order_index - b.order_index);
      for (const mod of modules) {
        const { data: newMod } = await serviceClient
          .from('modules')
          .insert({
            template_id: newTmpl.id,
            title: mod.title,
            objective: mod.objective,
            order_index: mod.order_index,
          })
          .select('id')
          .single();

        if (!newMod) continue;

        const steps = (mod.steps || []).sort((a: any, b: any) => a.order_index - b.order_index);
        for (const step of steps) {
          const { data: newStep } = await serviceClient
            .from('module_steps')
            .insert({
              module_id: newMod.id,
              title: step.title,
              instruction_markdown: step.instruction_markdown,
              estimated_minutes: step.estimated_minutes,
              is_required: step.is_required,
              order_index: step.order_index,
              ai_tool_name: step.ai_tool_name,
              ai_tool_url: step.ai_tool_url,
            })
            .select('id')
            .single();

          if (!newStep) continue;

          const blocks = (step.prompt_blocks || []).sort((a: any, b: any) => a.order_index - b.order_index);
          if (blocks.length > 0) {
            await serviceClient
              .from('prompt_blocks')
              .insert(blocks.map((b: any) => ({
                step_id: newStep.id,
                title: b.title,
                content_markdown: b.content_markdown,
                is_copyable: b.is_copyable,
                order_index: b.order_index,
              })));
          }
        }
      }

      revalidatePath('/admin/templates');
      return NextResponse.json({ success: true, data: { id: newTmpl.id } });
    }

    // ── Duplicate Module ────────────────────────────────────────────
    if (payload.type === 'module') {
      const { data: mod } = await serviceClient
        .from('modules')
        .select(`
          title, objective, order_index, template_id,
          template:workshop_templates!inner(organization_id),
          steps:module_steps(
            title, instruction_markdown, estimated_minutes, is_required, order_index, ai_tool_name, ai_tool_url,
            prompt_blocks(title, content_markdown, is_copyable, order_index)
          )
        `)
        .eq('id', payload.module_id)
        .eq('template.organization_id', facilitator.organization_id)
        .single();

      if (!mod) {
        return NextResponse.json({ success: false, error: 'Module not found' }, { status: 404 });
      }

      // Get next order_index
      const { count } = await serviceClient
        .from('modules')
        .select('id', { count: 'exact', head: true })
        .eq('template_id', mod.template_id);

      const { data: newMod, error: modErr } = await serviceClient
        .from('modules')
        .insert({
          template_id: mod.template_id,
          title: `${mod.title} (Copy)`,
          objective: mod.objective,
          order_index: count || 0,
        })
        .select('id, title, objective, order_index')
        .single();

      if (modErr || !newMod) {
        return NextResponse.json({ success: false, error: 'Failed to duplicate module' }, { status: 500 });
      }

      // Copy steps and blocks
      const steps = ((mod.steps as any[]) || []).sort((a: any, b: any) => a.order_index - b.order_index);
      const newSteps: any[] = [];
      for (const step of steps) {
        const { data: newStep } = await serviceClient
          .from('module_steps')
          .insert({
            module_id: newMod.id,
            title: step.title,
            instruction_markdown: step.instruction_markdown,
            estimated_minutes: step.estimated_minutes,
            is_required: step.is_required,
            order_index: step.order_index,
            ai_tool_name: step.ai_tool_name,
            ai_tool_url: step.ai_tool_url,
          })
          .select('id, title, order_index, instruction_markdown, estimated_minutes, is_required, ai_tool_name, ai_tool_url')
          .single();

        if (!newStep) continue;

        const blocks = (step.prompt_blocks || []).sort((a: any, b: any) => a.order_index - b.order_index);
        let newBlocks: any[] = [];
        if (blocks.length > 0) {
          const { data: insertedBlocks } = await serviceClient
            .from('prompt_blocks')
            .insert(blocks.map((b: any) => ({
              step_id: newStep.id,
              title: b.title,
              content_markdown: b.content_markdown,
              is_copyable: b.is_copyable,
              order_index: b.order_index,
            })))
            .select('id, title, content_markdown, is_copyable, order_index');
          newBlocks = insertedBlocks || [];
        }

        newSteps.push({ ...newStep, prompt_blocks: newBlocks });
      }

      revalidatePath('/admin/templates');
      return NextResponse.json({ success: true, data: { ...newMod, steps: newSteps } });
    }

    // ── Duplicate Step ──────────────────────────────────────────────
    if (payload.type === 'step') {
      const { data: step } = await serviceClient
        .from('module_steps')
        .select(`
          title, instruction_markdown, estimated_minutes, is_required, order_index, ai_tool_name, ai_tool_url,
          module:modules!inner(template:workshop_templates!inner(organization_id)),
          prompt_blocks(title, content_markdown, is_copyable, order_index)
        `)
        .eq('id', payload.step_id)
        .eq('module.template.organization_id', facilitator.organization_id)
        .single();

      if (!step) {
        return NextResponse.json({ success: false, error: 'Step not found' }, { status: 404 });
      }

      const { count } = await serviceClient
        .from('module_steps')
        .select('id', { count: 'exact', head: true })
        .eq('module_id', payload.target_module_id);

      const { data: newStep, error: stepErr } = await serviceClient
        .from('module_steps')
        .insert({
          module_id: payload.target_module_id,
          title: `${step.title} (Copy)`,
          instruction_markdown: step.instruction_markdown,
          estimated_minutes: step.estimated_minutes,
          is_required: step.is_required,
          order_index: count || 0,
          ai_tool_name: step.ai_tool_name,
          ai_tool_url: step.ai_tool_url,
        })
        .select('id, title, order_index, instruction_markdown, estimated_minutes, is_required, ai_tool_name, ai_tool_url')
        .single();

      if (stepErr || !newStep) {
        return NextResponse.json({ success: false, error: 'Failed to duplicate step' }, { status: 500 });
      }

      const blocks = (step.prompt_blocks as any[]) || [];
      let newBlocks: any[] = [];
      if (blocks.length > 0) {
        const { data: insertedBlocks } = await serviceClient
          .from('prompt_blocks')
          .insert(blocks.map((b: any) => ({
            step_id: newStep.id,
            title: b.title,
            content_markdown: b.content_markdown,
            is_copyable: b.is_copyable,
            order_index: b.order_index,
          })))
          .select('id, title, content_markdown, is_copyable, order_index');
        newBlocks = insertedBlocks || [];
      }

      revalidatePath('/admin/templates');
      return NextResponse.json({ success: true, data: { ...newStep, prompt_blocks: newBlocks } });
    }

    // ── Duplicate Prompt Block ──────────────────────────────────────
    if (payload.type === 'prompt_block') {
      const { data: block } = await serviceClient
        .from('prompt_blocks')
        .select(`
          title, content_markdown, is_copyable,
          step:module_steps!inner(module:modules!inner(template:workshop_templates!inner(organization_id)))
        `)
        .eq('id', payload.block_id)
        .eq('step.module.template.organization_id', facilitator.organization_id)
        .single();

      if (!block) {
        return NextResponse.json({ success: false, error: 'Block not found' }, { status: 404 });
      }

      const { count } = await serviceClient
        .from('prompt_blocks')
        .select('id', { count: 'exact', head: true })
        .eq('step_id', payload.target_step_id);

      const { data: newBlock, error: blockErr } = await serviceClient
        .from('prompt_blocks')
        .insert({
          step_id: payload.target_step_id,
          title: `${block.title} (Copy)`,
          content_markdown: block.content_markdown,
          is_copyable: block.is_copyable,
          order_index: count || 0,
        })
        .select('id, title, content_markdown, is_copyable, order_index')
        .single();

      if (blockErr || !newBlock) {
        return NextResponse.json({ success: false, error: 'Failed to duplicate block' }, { status: 500 });
      }

      revalidatePath('/admin/templates');
      return NextResponse.json({ success: true, data: newBlock });
    }

    return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('Duplicate error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
