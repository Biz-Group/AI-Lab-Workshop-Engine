import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { syncModuleToLibrary } from '@/lib/utils/library-sync';
import { z } from 'zod';

const createModuleSchema = z.object({
  template_id: z.string().uuid(),
  title: z.string().min(1, 'Title is required').max(200),
  objective: z.string().max(2000).optional().default(''),
  order_index: z.number().int().min(0).optional(),
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
    const validation = createModuleSchema.safeParse(body);

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

    // Auto-set order_index if not provided
    let orderIndex = validation.data.order_index;
    if (orderIndex === undefined) {
      const { count } = await serviceClient
        .from('modules')
        .select('id', { count: 'exact', head: true })
        .eq('template_id', validation.data.template_id);
      orderIndex = count || 0;
    }

    const { data: mod, error } = await serviceClient
      .from('modules')
      .insert({
        template_id: validation.data.template_id,
        title: validation.data.title,
        objective: validation.data.objective || null,
        order_index: orderIndex,
      })
      .select('id, title, objective, order_index')
      .single();

    if (error) {
      console.error('Module creation error:', error);
      return NextResponse.json({ success: false, error: 'Failed to create module' }, { status: 500 });
    }

    revalidatePath('/admin/modules');
    revalidatePath('/admin/templates');

    // Sync new module to library
    await syncModuleToLibrary(serviceClient, mod.id, facilitator.organization_id);

    return NextResponse.json({ success: true, data: mod });
  } catch (error) {
    console.error('Modules POST error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
