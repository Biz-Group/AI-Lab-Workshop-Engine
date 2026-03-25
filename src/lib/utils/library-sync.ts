import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Syncs a template module (with its steps + prompt blocks) to the activity library.
 * If a library entry with this source_module_id exists, it's updated (children replaced).
 * If not, a new library entry is created.
 *
 * One-way sync: template → library only. Non-fatal on failure.
 */
export async function syncModuleToLibrary(
  serviceClient: SupabaseClient,
  moduleId: string,
  organizationId: string
): Promise<void> {
  try {
    const { data: mod } = await serviceClient
      .from('modules')
      .select(`
        id,
        title,
        objective,
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
      .eq('id', moduleId)
      .single();

    if (!mod) return;

    // Check if a library entry already exists for this module
    const { data: existing } = await serviceClient
      .from('activity_library')
      .select('id')
      .eq('source_module_id', moduleId)
      .single();

    let activityId: string;

    if (existing) {
      await serviceClient
        .from('activity_library')
        .update({ title: mod.title, objective: mod.objective, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      // Delete old steps (cascades to blocks) then re-create
      await serviceClient
        .from('activity_library_steps')
        .delete()
        .eq('activity_id', existing.id);

      activityId = existing.id;
    } else {
      const { data: newActivity, error } = await serviceClient
        .from('activity_library')
        .insert({
          organization_id: organizationId,
          title: mod.title,
          objective: mod.objective,
          source_module_id: moduleId,
        })
        .select('id')
        .single();

      if (error || !newActivity) {
        console.error('Library sync - create activity error:', error);
        return;
      }
      activityId = newActivity.id;
    }

    // Re-create all steps + blocks
    const steps = (mod.steps as Array<{
      title: string;
      instruction_markdown: string;
      order_index: number;
      estimated_minutes: number | null;
      is_required: boolean;
      ai_tool_name: string | null;
      ai_tool_url: string | null;
      prompt_blocks: Array<{
        title: string;
        content_markdown: string;
        order_index: number;
        is_copyable: boolean;
      }>;
    }>) || [];

    for (const step of steps) {
      const { data: newStep } = await serviceClient
        .from('activity_library_steps')
        .insert({
          activity_id: activityId,
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

      if (!newStep) continue;

      const blocks = step.prompt_blocks || [];
      if (blocks.length > 0) {
        await serviceClient
          .from('activity_library_prompt_blocks')
          .insert(
            blocks.map(b => ({
              library_step_id: newStep.id,
              title: b.title,
              content_markdown: b.content_markdown,
              order_index: b.order_index,
              is_copyable: b.is_copyable,
            }))
          );
      }
    }
  } catch (error) {
    console.error('Library sync error for module', moduleId, error);
  }
}

/**
 * Removes the library copy when a template module is deleted.
 */
export async function deleteModuleFromLibrary(
  serviceClient: SupabaseClient,
  moduleId: string
): Promise<void> {
  try {
    await serviceClient
      .from('activity_library')
      .delete()
      .eq('source_module_id', moduleId);
  } catch (error) {
    console.error('Library delete sync error for module', moduleId, error);
  }
}

/**
 * Finds the parent module ID and org ID from a step ID.
 */
export async function getModuleIdFromStep(
  serviceClient: SupabaseClient,
  stepId: string
): Promise<{ moduleId: string; organizationId: string } | null> {
  const { data } = await serviceClient
    .from('module_steps')
    .select(`
      module_id,
      module:modules!inner(
        template:workshop_templates!inner(organization_id)
      )
    `)
    .eq('id', stepId)
    .single();

  if (!data) return null;
  const mod = data.module as unknown as { template: { organization_id: string } };
  return { moduleId: data.module_id, organizationId: mod.template.organization_id };
}

/**
 * Finds the parent module ID and org ID from a prompt block ID.
 */
export async function getModuleIdFromBlock(
  serviceClient: SupabaseClient,
  blockId: string
): Promise<{ moduleId: string; organizationId: string } | null> {
  const { data } = await serviceClient
    .from('prompt_blocks')
    .select(`
      step:module_steps!inner(
        module_id,
        module:modules!inner(
          template:workshop_templates!inner(organization_id)
        )
      )
    `)
    .eq('id', blockId)
    .single();

  if (!data) return null;
  const step = data.step as unknown as { module_id: string; module: { template: { organization_id: string } } };
  return { moduleId: step.module_id, organizationId: step.module.template.organization_id };
}
