import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { generateJoinCode } from '@/lib/utils';
import { z } from 'zod';

const createSessionSchema = z.object({
  template_id: z.string().uuid(),
  client_name: z.string().min(1, 'Client name is required').max(200),
  department: z.string().max(200).optional().default(''),
  location: z.string().min(1, 'Location is required').max(200),
  poc_name: z.string().min(1, 'Point of contact is required').max(200),
  poc_email: z.string().email('Valid email is required').max(200),
  event_type: z.enum(['keynote', 'halfday', 'fullday']),
  event_date: z.string().datetime({ message: 'Valid date/time is required' }),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get facilitator info
    const serviceClient = await createServiceClient();
    const { data: facilitator, error: facError } = await serviceClient
      .from('facilitator_users')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (facError || !facilitator) {
      return NextResponse.json(
        { success: false, error: 'Facilitator profile not found' },
        { status: 403 }
      );
    }

    // Parse and validate body
    const body = await request.json();
    const validation = createSessionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Verify template belongs to this org
    const { data: template, error: templateError } = await serviceClient
      .from('workshop_templates')
      .select('id, name, ai_tool_name, ai_tool_url')
      .eq('id', data.template_id)
      .eq('organization_id', facilitator.organization_id)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      );
    }

    // Generate unique join code
    const joinCode = generateJoinCode();

    // Create the session as 'published' so attendees can join immediately
    const { data: session, error: sessionError } = await serviceClient
      .from('sessions')
      .insert({
        organization_id: facilitator.organization_id,
        template_id: data.template_id,
        facilitator_id: facilitator.id,
        join_code: joinCode,
        status: 'published',
        client_name: data.client_name,
        department: data.department || null,
        location: data.location,
        poc_name: data.poc_name,
        poc_email: data.poc_email,
        event_type: data.event_type,
        event_date: data.event_date,
        scheduled_at: data.event_date,
        ai_tool_name: template.ai_tool_name ?? 'ChatGPT',
        ai_tool_url: template.ai_tool_url ?? 'https://chat.openai.com',
      })
      .select('id')
      .single();

    if (sessionError) {
      console.error('Session creation error:', sessionError);
      return NextResponse.json(
        { success: false, error: 'Failed to create session' },
        { status: 500 }
      );
    }

    // Create snapshot copies of the template content using batch inserts
    // 1. Fetch all modules first
    const { data: modules } = await serviceClient
      .from('modules')
      .select('id, title, objective, order_index')
      .eq('template_id', data.template_id)
      .order('order_index');

    if (modules && modules.length > 0) {
      const moduleIds = modules.map(m => m.id);

      // 2. Fetch all steps and blocks in parallel
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

      // Filter blocks to only those belonging to steps in our modules
      const stepIds = allSteps?.map(s => s.id) || [];

      // Re-fetch blocks with proper filter (need step_ids)
      let allBlocks = blocksResult.data;
      if (stepIds.length > 0 && allBlocks) {
        // Filter to only relevant blocks
        const stepIdSet = new Set(stepIds);
        allBlocks = allBlocks.filter(b => stepIdSet.has(b.step_id));
      }

      // 3. Batch insert all module snapshots
      const { data: snapModules } = await serviceClient
        .from('session_snapshot_modules')
        .insert(
          modules.map(mod => ({
            session_id: session.id,
            original_module_id: mod.id,
            title: mod.title,
            objective: mod.objective,
            order_index: mod.order_index,
          }))
        )
        .select('id, original_module_id');

      if (snapModules && allSteps && allSteps.length > 0) {
        // Build module ID mapping: original -> snapshot
        const moduleIdMap = new Map(
          snapModules.map(sm => [sm.original_module_id, sm.id])
        );

        // 4. Batch insert all step snapshots
        const stepInserts = allSteps
          .filter(step => moduleIdMap.has(step.module_id))
          .map(step => ({
            session_id: session.id,
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
          // Build step ID mapping: original -> snapshot
          const stepIdMap = new Map(
            snapSteps.map(ss => [ss.original_step_id, ss.id])
          );

          // 5. Batch insert all prompt block snapshots
          const blockInserts = allBlocks
            .filter(block => stepIdMap.has(block.step_id))
            .map(block => ({
              session_id: session.id,
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
      }

      // Set the first step as current
      const { data: firstStep } = await serviceClient
        .from('session_snapshot_steps')
        .select('id')
        .eq('session_id', session.id)
        .order('order_index')
        .limit(1)
        .single();

      if (firstStep) {
        await serviceClient
          .from('sessions')
          .update({ current_step_id: firstStep.id })
          .eq('id', session.id);
      }
    }

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        joinCode,
      },
    });
  } catch (error) {
    console.error('Create session error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
