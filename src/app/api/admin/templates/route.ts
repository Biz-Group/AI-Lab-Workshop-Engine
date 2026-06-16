import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional().default(''),
  estimated_duration_minutes: z.number().int().min(1).max(600).default(60),
  is_published: z.boolean().default(false),
});

export async function GET() {
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

    const { data: templates, error } = await serviceClient
      .from('workshop_templates')
      .select(`
        id,
        name,
        description,
        estimated_duration_minutes,
        is_published,
        created_at,
        updated_at
      `)
      .eq('organization_id', facilitator.organization_id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to fetch templates' }, { status: 500 });
    }

    // Get module counts for each template
    const templateIds = templates?.map(t => t.id) || [];
    let moduleCounts: Record<string, number> = {};
    if (templateIds.length > 0) {
      const { data: modules } = await serviceClient
        .from('modules')
        .select('template_id')
        .in('template_id', templateIds);

      moduleCounts = (modules || []).reduce((acc, m) => {
        acc[m.template_id] = (acc[m.template_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    }

    const enriched = (templates || []).map(t => ({
      ...t,
      module_count: moduleCounts[t.id] || 0,
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error('Templates GET error:', error);
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
    const validation = createTemplateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { data: template, error } = await serviceClient
      .from('workshop_templates')
      .insert({
        organization_id: facilitator.organization_id,
        name: validation.data.name,
        description: validation.data.description || null,
        estimated_duration_minutes: validation.data.estimated_duration_minutes,
        is_published: validation.data.is_published,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Template creation error:', error);
      return NextResponse.json({ success: false, error: 'Failed to create template' }, { status: 500 });
    }

    revalidatePath('/admin/templates');
    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error('Templates POST error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
