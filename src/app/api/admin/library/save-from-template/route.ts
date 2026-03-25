import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const saveSchema = z.object({
  module_id: z.string().uuid('Valid module ID is required'),
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
    const validation = saveSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    // Fetch the module with all steps and prompt blocks, verifying org access
    const { data: mod } = await serviceClient
      .from('modules')
      .select(`
        id,
        title,
        objective,
        template:workshop_templates!inner(organization_id),
        steps:module_steps(
          id,
          title,
          instruction_markdown,
          order_index,
          estimated_minutes,
          is_required,
          ai_tool_name,
          ai_tool_url,
          prompt_blocks(
            id,
            title,
            content_markdown,
            order_index,
            is_copyable
          )
        )
      `)
      .eq('id', validation.data.module_id)
      .single();

    if (!mod) {
      return NextResponse.json({ success: false, error: 'Module not found' }, { status: 404 });
    }

    // Verify org access
    const template = mod.template as unknown as { organization_id: string };
    if (template.organization_id !== facilitator.organization_id) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // 1. Create library activity
    const { data: activity, error: actError } = await serviceClient
      .from('activity_library')
      .insert({
        organization_id: facilitator.organization_id,
        title: mod.title,
        objective: mod.objective,
      })
      .select('id')
      .single();

    if (actError || !activity) {
      console.error('Save to library - activity creation error:', actError);
      return NextResponse.json({ success: false, error: 'Failed to save activity' }, { status: 500 });
    }

    // 2. Deep copy steps
    const steps = (mod.steps as Array<{
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

    for (const step of steps) {
      const { data: newStep, error: stepError } = await serviceClient
        .from('activity_library_steps')
        .insert({
          activity_id: activity.id,
          title: step.title,
          instruction_markdown: step.instruction_markdown,
          order_index: step.order_index,
          estimated_minutes: step.estimated_minutes,
          is_required: step.is_required,
          ai_tool_name: step.ai_tool_name,
          ai_tool_url: step.ai_tool_url,
        })
        .select('id')
        .single();

      if (stepError || !newStep) {
        console.error('Save to library - step copy error:', stepError);
        // Clean up the partially created activity
        await serviceClient.from('activity_library').delete().eq('id', activity.id);
        return NextResponse.json({ success: false, error: 'Failed to copy steps' }, { status: 500 });
      }

      // 3. Deep copy prompt blocks for this step
      const blocks = step.prompt_blocks || [];
      if (blocks.length > 0) {
        const blockInserts = blocks.map(b => ({
          library_step_id: newStep.id,
          title: b.title,
          content_markdown: b.content_markdown,
          order_index: b.order_index,
          is_copyable: b.is_copyable,
        }));

        const { error: blockError } = await serviceClient
          .from('activity_library_prompt_blocks')
          .insert(blockInserts);

        if (blockError) {
          console.error('Save to library - block copy error:', blockError);
          await serviceClient.from('activity_library').delete().eq('id', activity.id);
          return NextResponse.json({ success: false, error: 'Failed to copy prompt blocks' }, { status: 500 });
        }
      }
    }

    revalidatePath('/admin/modules');
    return NextResponse.json({ success: true, data: { id: activity.id } });
  } catch (error) {
    console.error('Save to library error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
