import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const reorderSchema = z.object({
  table: z.enum(['modules', 'module_steps', 'prompt_blocks']),
  items: z.array(z.object({
    id: z.string().uuid(),
    order_index: z.number().int().min(0),
  })).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = reorderSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const { table, items } = validation.data;
    const serviceClient = await createServiceClient();

    // Verify user has access to at least the first item via org membership
    const firstId = items[0].id;

    if (table === 'modules') {
      const { data: mod } = await serviceClient
        .from('modules')
        .select(`
          id,
          template:workshop_templates!inner(
            organization:organizations!inner(
              facilitator_users!inner(user_id)
            )
          )
        `)
        .eq('id', firstId)
        .eq('template.organization.facilitator_users.user_id', user.id)
        .single();

      if (!mod) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
    } else if (table === 'module_steps') {
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
        .eq('id', firstId)
        .eq('module.template.organization.facilitator_users.user_id', user.id)
        .single();

      if (!step) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
    } else if (table === 'prompt_blocks') {
      const { data: block } = await serviceClient
        .from('prompt_blocks')
        .select(`
          id,
          step:module_steps!inner(
            module:modules!inner(
              template:workshop_templates!inner(
                organization:organizations!inner(
                  facilitator_users!inner(user_id)
                )
              )
            )
          )
        `)
        .eq('id', firstId)
        .eq('step.module.template.organization.facilitator_users.user_id', user.id)
        .single();

      if (!block) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
    }

    // Batch update order_index for all items
    const updates = items.map(item =>
      serviceClient
        .from(table)
        .update({ order_index: item.order_index })
        .eq('id', item.id)
    );

    const results = await Promise.all(updates);
    const failed = results.find(r => r.error);
    if (failed?.error) {
      console.error('Reorder error:', failed.error);
      return NextResponse.json({ success: false, error: 'Failed to reorder items' }, { status: 500 });
    }

    revalidatePath('/admin/templates');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reorder error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
