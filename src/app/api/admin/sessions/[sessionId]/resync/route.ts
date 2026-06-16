import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await params;
    const serviceClient = await createServiceClient();

    // Verify facilitator org membership
    const { data: facilitator } = await serviceClient
      .from('facilitator_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!facilitator) {
      return NextResponse.json({ success: false, error: 'Facilitator not found' }, { status: 403 });
    }

    // Get session with template_id and current_step_id
    const { data: session } = await serviceClient
      .from('sessions')
      .select('id, template_id, current_step_id, status, organization_id')
      .eq('id', sessionId)
      .eq('organization_id', facilitator.organization_id)
      .single();

    if (!session) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    // Only allow resync for draft/published sessions
    if (session.status !== 'draft' && session.status !== 'published') {
      return NextResponse.json(
        { success: false, error: 'Can only resync draft or published sessions' },
        { status: 400 }
      );
    }

    // Get original_step_id of current step for remapping
    let originalStepId: string | null = null;
    if (session.current_step_id) {
      const { data: currentSnap } = await serviceClient
        .from('session_snapshot_steps')
        .select('original_step_id')
        .eq('id', session.current_step_id)
        .single();
      originalStepId = currentSnap?.original_step_id || null;
    }

    // Delete existing snapshot data (cascade deletes steps + blocks)
    await serviceClient
      .from('session_snapshot_modules')
      .delete()
      .eq('session_id', sessionId);

    // Get template info for AI tool defaults
    const { data: template } = await serviceClient
      .from('workshop_templates')
      .select('id, ai_tool_name, ai_tool_url')
      .eq('id', session.template_id)
      .single();

    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    // Re-create snapshots from template (same logic as session creation)
    const { data: modules } = await serviceClient
      .from('modules')
      .select('id, title, objective, order_index')
      .eq('template_id', session.template_id)
      .order('order_index');

    if (modules && modules.length > 0) {
      const moduleIds = modules.map(m => m.id);

      const [stepsResult, blocksResult] = await Promise.all([
        serviceClient
          .from('module_steps')
          .select('id, module_id, title, instruction_markdown, order_index, estimated_minutes, is_required, show_response_field, ai_tool_name, ai_tool_url')
          .in('module_id', moduleIds)
          .order('order_index'),
        serviceClient
          .from('prompt_blocks')
          .select('id, step_id, title, content_markdown, order_index, is_copyable')
          .order('order_index'),
      ]);

      const allSteps = stepsResult.data;
      const stepIds = allSteps?.map(s => s.id) || [];

      let allBlocks = blocksResult.data;
      if (stepIds.length > 0 && allBlocks) {
        const stepIdSet = new Set(stepIds);
        allBlocks = allBlocks.filter(b => stepIdSet.has(b.step_id));
      }

      // Insert module snapshots
      const { data: snapModules } = await serviceClient
        .from('session_snapshot_modules')
        .insert(
          modules.map(mod => ({
            session_id: sessionId,
            original_module_id: mod.id,
            title: mod.title,
            objective: mod.objective,
            order_index: mod.order_index,
          }))
        )
        .select('id, original_module_id');

      if (snapModules && allSteps && allSteps.length > 0) {
        const moduleIdMap = new Map(
          snapModules.map(sm => [sm.original_module_id, sm.id])
        );

        const stepInserts = allSteps
          .filter(step => moduleIdMap.has(step.module_id))
          .map(step => ({
            session_id: sessionId,
            snapshot_module_id: moduleIdMap.get(step.module_id)!,
            original_step_id: step.id,
            title: step.title,
            instruction_markdown: step.instruction_markdown,
            instruction_markdown_raw: step.instruction_markdown,
            order_index: step.order_index,
            estimated_minutes: step.estimated_minutes,
            is_required: step.is_required,
            show_response_field: step.show_response_field ?? true,
            ai_tool_name: step.ai_tool_name ?? template.ai_tool_name ?? 'ChatGPT',
            ai_tool_url: step.ai_tool_url ?? template.ai_tool_url ?? 'https://chat.openai.com',
          }));

        const { data: snapSteps } = await serviceClient
          .from('session_snapshot_steps')
          .insert(stepInserts)
          .select('id, original_step_id');

        if (snapSteps && allBlocks && allBlocks.length > 0) {
          const stepIdMap = new Map(
            snapSteps.map(ss => [ss.original_step_id, ss.id])
          );

          const blockInserts = allBlocks
            .filter(block => stepIdMap.has(block.step_id))
            .map(block => ({
              session_id: sessionId,
              snapshot_step_id: stepIdMap.get(block.step_id)!,
              original_block_id: block.id,
              title: block.title,
              content_markdown: block.content_markdown,
              content_markdown_raw: block.content_markdown,
              order_index: block.order_index,
              is_copyable: block.is_copyable,
            }));

          if (blockInserts.length > 0) {
            await serviceClient
              .from('session_snapshot_prompt_blocks')
              .insert(blockInserts);
          }
        }

        // Remap current_step_id
        let newCurrentStepId: string | null = null;

        if (originalStepId && snapSteps) {
          const remapped = snapSteps.find(ss => ss.original_step_id === originalStepId);
          if (remapped) newCurrentStepId = remapped.id;
        }

        // If not found, default to first step
        if (!newCurrentStepId) {
          const { data: firstStep } = await serviceClient
            .from('session_snapshot_steps')
            .select('id')
            .eq('session_id', sessionId)
            .order('order_index')
            .limit(1)
            .single();
          newCurrentStepId = firstStep?.id || null;
        }

        await serviceClient
          .from('sessions')
          .update({ current_step_id: newCurrentStepId })
          .eq('id', sessionId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Resync error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
