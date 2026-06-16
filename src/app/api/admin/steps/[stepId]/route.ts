import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { syncModuleToLibrary, getModuleIdFromStep } from '@/lib/utils/library-sync';
import { z } from 'zod';

const updateStepSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  instruction_markdown: z.string().optional(),
  estimated_minutes: z.number().int().min(1).max(120).nullable().optional(),
  is_required: z.boolean().optional(),
  show_response_field: z.boolean().optional(),
  order_index: z.number().int().min(0).optional(),
  ai_tool_name: z.string().max(100).nullable().optional(),
  ai_tool_url: z.string().url().max(2000).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { stepId } = await params;
    const serviceClient = await createServiceClient();

    const { data: step } = await serviceClient
      .from('module_steps')
      .select(`
        id,
        module:modules!inner(
          template:workshop_templates!inner(
            organization:organizations!inner(
              facilitator_users!inner(user_id)
            )
          )
        )
      `)
      .eq('id', stepId)
      .eq('module.template.organization.facilitator_users.user_id', user.id)
      .single();

    if (!step) {
      return NextResponse.json({ success: false, error: 'Step not found or access denied' }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateStepSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const { error } = await serviceClient
      .from('module_steps')
      .update(validation.data)
      .eq('id', stepId);

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to update step' }, { status: 500 });
    }

    revalidatePath('/admin/templates');

    // Sync parent module to library
    const modInfo = await getModuleIdFromStep(serviceClient, stepId);
    if (modInfo) {
      await syncModuleToLibrary(serviceClient, modInfo.moduleId, modInfo.organizationId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Step PATCH error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { stepId } = await params;
    const serviceClient = await createServiceClient();

    const { data: step } = await serviceClient
      .from('module_steps')
      .select(`
        id,
        module:modules!inner(
          template:workshop_templates!inner(
            organization:organizations!inner(
              facilitator_users!inner(user_id)
            )
          )
        )
      `)
      .eq('id', stepId)
      .eq('module.template.organization.facilitator_users.user_id', user.id)
      .single();

    if (!step) {
      return NextResponse.json({ success: false, error: 'Step not found or access denied' }, { status: 404 });
    }

    // Capture module info before delete
    const modInfo = await getModuleIdFromStep(serviceClient, stepId);

    const { error } = await serviceClient
      .from('module_steps')
      .delete()
      .eq('id', stepId);

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to delete step' }, { status: 500 });
    }

    revalidatePath('/admin/modules');
    revalidatePath('/admin/templates');

    // Sync parent module to library
    if (modInfo) {
      await syncModuleToLibrary(serviceClient, modInfo.moduleId, modInfo.organizationId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Step DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
