import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const moveStepSchema = z.object({
  step_id: z.string().uuid(),
  target_module_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = moveStepSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const { step_id, target_module_id } = validation.data;
    const serviceClient = await createServiceClient();

    // Verify user access to step
    const { data: step } = await serviceClient
      .from('module_steps')
      .select(`
        id, module_id,
        module:modules!inner(
          template:workshop_templates!inner(
            organization:organizations!inner(
              facilitator_users!inner(user_id)
            )
          )
        )
      `)
      .eq('id', step_id)
      .eq('module.template.organization.facilitator_users.user_id', user.id)
      .single();

    if (!step) {
      return NextResponse.json({ success: false, error: 'Step not found or access denied' }, { status: 404 });
    }

    // Verify user access to target module
    const { data: targetMod } = await serviceClient
      .from('modules')
      .select(`
        id,
        template:workshop_templates!inner(
          organization:organizations!inner(
            facilitator_users!inner(user_id)
          )
        )
      `)
      .eq('id', target_module_id)
      .eq('template.organization.facilitator_users.user_id', user.id)
      .single();

    if (!targetMod) {
      return NextResponse.json({ success: false, error: 'Target module not found or access denied' }, { status: 404 });
    }

    // Get next order_index in target module
    const { count } = await serviceClient
      .from('module_steps')
      .select('id', { count: 'exact', head: true })
      .eq('module_id', target_module_id);

    // Move the step
    const { error } = await serviceClient
      .from('module_steps')
      .update({
        module_id: target_module_id,
        order_index: count || 0,
      })
      .eq('id', step_id);

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to move step' }, { status: 500 });
    }

    revalidatePath('/admin/templates');
    return NextResponse.json({ success: true, data: { new_order_index: count || 0 } });
  } catch (error) {
    console.error('Move step error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
