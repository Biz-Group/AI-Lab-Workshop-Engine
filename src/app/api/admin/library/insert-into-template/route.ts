import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const insertSchema = z.object({
  activity_id: z.string().uuid('Valid activity ID is required'),
  template_id: z.string().uuid('Valid template ID is required'),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = await createServiceClient();
    const { data: facilitator } = await serviceClient
      .from('facilitator_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!facilitator) {
      return NextResponse.json({ success: false, error: 'Facilitator not found' }, { status: 403 });
    }

    const body = await request.json();
    const validation = insertSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    // Verify template belongs to org
    const { data: template } = await serviceClient
      .from('workshop_templates')
      .select('id')
      .eq('id', validation.data.template_id)
      .eq('organization_id', facilitator.organization_id)
      .single();

    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    // Fetch library activity with all steps and blocks, verifying org access
    const { data: activity } = await serviceClient
      .from('activity_library')
      .select(`
        id,
        title,
        objective,
        steps:activity_library_steps(
          id,
          title,
          instruction_markdown,
          order_index,
          estimated_minutes,
          is_required,
          ai_tool_name,
          ai_tool_url,
          prompt_blocks:activity_library_prompt_blocks(
            id,
            title,
            content_markdown,
            order_index,
            is_copyable
          )
        )
      `)
      .eq('id', validation.data.activity_id)
      .eq('organization_id', facilitator.organization_id)
      .single();

    if (!activity) {
      return NextResponse.json({ success: false, error: 'Library activity not found' }, { status: 404 });
    }

    // Determine next order_index for the template's modules
    const { count } = await serviceClient
      .from('modules')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', validation.data.template_id);
    const nextOrderIndex = count || 0;

    // 1. Create module in template
    const { data: newModule, error: modError } = await serviceClient
      .from('modules')
      .insert({
        template_id: validation.data.template_id,
        title: activity.title,
        objective: activity.objective,
        order_index: nextOrderIndex,
      })
      .select('id, title, objective, order_index')
      .single();

    if (modError || !newModule) {
      console.error('Insert into template - module creation error:', modError);
      return NextResponse.json({ success: false, error: 'Failed to create module' }, { status: 500 });
    }

    // 2. Deep copy steps
    const steps = (activity.steps as Array<{
      id: string;
      title: string;
      instruction_markdown: string;
      order_index: number;
      estimated_minutes: number | null;
      is_required: boolean;
      ai_tool_name: string | null;
      ai_tool_url: string | null;
      prompt_blocks: Array<{
        id: string;
        title: string;
        content_markdown: string;
        order_index: number;
        is_copyable: boolean;
      }>;
    }>) || [];

    const newSteps: Array<{
      id: string;
      title: string;
      order_index: number;
      instruction_markdown: string;
      estimated_minutes: number | null;
      is_required: boolean;
      ai_tool_name: string | null;
      ai_tool_url: string | null;
      prompt_blocks: Array<{
        id: string;
        title: string;
        content_markdown: string;
        order_index: number;
        is_copyable: boolean;
      }>;
    }> = [];

    for (const step of steps) {
      const { data: newStep, error: stepError } = await serviceClient
        .from('module_steps')
        .insert({
          module_id: newModule.id,
          title: step.title,
          instruction_markdown: step.instruction_markdown,
          order_index: step.order_index,
          estimated_minutes: step.estimated_minutes,
          is_required: step.is_required,
          ai_tool_name: step.ai_tool_name,
          ai_tool_url: step.ai_tool_url,
        })
        .select('id, title, order_index, instruction_markdown, estimated_minutes, is_required, ai_tool_name, ai_tool_url')
        .single();

      if (stepError || !newStep) {
        console.error('Insert into template - step copy error:', stepError);
        // Clean up the partially created module
        await serviceClient.from('modules').delete().eq('id', newModule.id);
        return NextResponse.json({ success: false, error: 'Failed to copy steps' }, { status: 500 });
      }

      const copiedBlocks: Array<{
        id: string;
        title: string;
        content_markdown: string;
        order_index: number;
        is_copyable: boolean;
      }> = [];

      // 3. Deep copy prompt blocks for this step
      const blocks = step.prompt_blocks || [];
      if (blocks.length > 0) {
        const blockInserts = blocks.map(b => ({
          step_id: newStep.id,
          title: b.title,
          content_markdown: b.content_markdown,
          order_index: b.order_index,
          is_copyable: b.is_copyable,
        }));

        const { data: newBlocks, error: blockError } = await serviceClient
          .from('prompt_blocks')
          .insert(blockInserts)
          .select('id, title, content_markdown, order_index, is_copyable');

        if (blockError) {
          console.error('Insert into template - block copy error:', blockError);
          await serviceClient.from('modules').delete().eq('id', newModule.id);
          return NextResponse.json({ success: false, error: 'Failed to copy prompt blocks' }, { status: 500 });
        }

        if (newBlocks) {
          copiedBlocks.push(...newBlocks);
        }
      }

      newSteps.push({
        ...newStep,
        prompt_blocks: copiedBlocks,
      });
    }

    revalidatePath('/admin/templates');
    return NextResponse.json({
      success: true,
      data: {
        ...newModule,
        steps: newSteps,
      },
    });
  } catch (error) {
    console.error('Insert into template error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
