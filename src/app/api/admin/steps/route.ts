import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { syncModuleToLibrary } from '@/lib/utils/library-sync';
import { z } from 'zod';

const createStepSchema = z.object({
  module_id: z.string().uuid(),
  title: z.string().min(1, 'Title is required').max(200),
  instruction_markdown: z.string().default(''),
  estimated_minutes: z.number().int().min(1).max(120).nullable().optional(),
  is_required: z.boolean().default(false),
  show_response_field: z.boolean().default(true),
  order_index: z.number().int().min(0).optional(),
  ai_tool_name: z.string().max(100).nullable().optional(),
  ai_tool_url: z.string().url().max(2000).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = await createServiceClient();
    const body = await request.json();
    const validation = createStepSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    // Verify access via module → template → org → facilitator
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
      .eq('id', validation.data.module_id)
      .eq('template.organization.facilitator_users.user_id', user.id)
      .single();

    if (!mod) {
      return NextResponse.json({ success: false, error: 'Module not found or access denied' }, { status: 404 });
    }

    let orderIndex = validation.data.order_index;
    if (orderIndex === undefined) {
      const { count } = await serviceClient
        .from('module_steps')
        .select('id', { count: 'exact', head: true })
        .eq('module_id', validation.data.module_id);
      orderIndex = count || 0;
    }

    const { data: step, error } = await serviceClient
      .from('module_steps')
      .insert({
        module_id: validation.data.module_id,
        title: validation.data.title,
        instruction_markdown: validation.data.instruction_markdown,
        estimated_minutes: validation.data.estimated_minutes ?? null,
        is_required: validation.data.is_required,
        order_index: orderIndex,
        ai_tool_name: validation.data.ai_tool_name ?? null,
        ai_tool_url: validation.data.ai_tool_url ?? null,
      })
      .select('id, title, order_index, instruction_markdown, estimated_minutes, is_required, ai_tool_name, ai_tool_url')
      .single();

    if (error) {
      console.error('Step creation error:', error);
      return NextResponse.json({ success: false, error: 'Failed to create step' }, { status: 500 });
    }

    revalidatePath('/admin/modules');
    revalidatePath('/admin/templates');

    // Sync parent module to library
    const { data: modForSync } = await serviceClient
      .from('modules')
      .select('template:workshop_templates!inner(organization_id)')
      .eq('id', validation.data.module_id)
      .single();
    if (modForSync) {
      const tmpl = modForSync.template as unknown as { organization_id: string };
      await syncModuleToLibrary(serviceClient, validation.data.module_id, tmpl.organization_id);
    }

    return NextResponse.json({ success: true, data: step });
  } catch (error) {
    console.error('Steps POST error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
