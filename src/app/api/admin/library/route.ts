import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createActivitySchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  objective: z.string().max(2000).optional().default(''),
});

export async function GET(request: NextRequest) {
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

    const { data: activities, error } = await serviceClient
      .from('activity_library')
      .select(`
        id,
        title,
        objective,
        created_at,
        updated_at,
        steps:activity_library_steps(id)
      `)
      .eq('organization_id', facilitator.organization_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Library list error:', error);
      return NextResponse.json({ success: false, error: 'Failed to load library' }, { status: 500 });
    }

    const libraryResult = (activities || []).map(a => ({
      id: a.id,
      title: a.title,
      objective: a.objective,
      created_at: a.created_at,
      updated_at: a.updated_at,
      step_count: Array.isArray(a.steps) ? a.steps.length : 0,
    }));

    // If include_templates param is set, also fetch template-grouped modules
    const includeTemplates = request.nextUrl.searchParams.get('include_templates') === 'true';
    if (includeTemplates) {
      const { data: templates } = await serviceClient
        .from('workshop_templates')
        .select(`
          id,
          name,
          modules(
            id,
            title,
            objective,
            order_index,
            steps:module_steps(id)
          )
        `)
        .eq('organization_id', facilitator.organization_id)
        .order('name');

      const templateResult = (templates || []).map(t => ({
        id: t.id,
        name: t.name,
        modules: ((t.modules as Array<{ id: string; title: string; objective: string | null; order_index: number; steps: { id: string }[] }>) || [])
          .sort((a, b) => a.order_index - b.order_index)
          .map(m => ({
            id: m.id,
            title: m.title,
            objective: m.objective,
            order_index: m.order_index,
            step_count: Array.isArray(m.steps) ? m.steps.length : 0,
          })),
      }));

      return NextResponse.json({
        success: true,
        data: { library: libraryResult, templates: templateResult },
      });
    }

    // Default: return just library array (used by AddModuleButton's "From Library" tab)
    return NextResponse.json({ success: true, data: libraryResult });
  } catch (error) {
    console.error('Library GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

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
    const validation = createActivitySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const { data: activity, error } = await serviceClient
      .from('activity_library')
      .insert({
        organization_id: facilitator.organization_id,
        title: validation.data.title,
        objective: validation.data.objective || null,
      })
      .select('id, title, objective, created_at, updated_at')
      .single();

    if (error) {
      console.error('Library creation error:', error);
      return NextResponse.json({ success: false, error: 'Failed to create activity' }, { status: 500 });
    }

    revalidatePath('/admin/modules');
    return NextResponse.json({ success: true, data: activity });
  } catch (error) {
    console.error('Library POST error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
