import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createStepSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  instruction_markdown: z.string().default(''),
  estimated_minutes: z.number().int().min(1).nullable().optional(),
  is_required: z.boolean().default(false),
  ai_tool_name: z.string().max(100).nullable().optional(),
  ai_tool_url: z.string().url().max(500).nullable().optional(),
  order_index: z.number().int().min(0).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ activityId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { activityId } = await params;
    const serviceClient = await createServiceClient();

    // Verify access: activity → org → facilitator
    const { data: activity } = await serviceClient
      .from('activity_library')
      .select(`
        id,
        organization:organizations!inner(
          facilitator_users!inner(user_id)
        )
      `)
      .eq('id', activityId)
      .eq('organization.facilitator_users.user_id', user.id)
      .single();

    if (!activity) {
      return NextResponse.json({ success: false, error: 'Activity not found or access denied' }, { status: 404 });
    }

    const body = await request.json();
    const validation = createStepSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    let orderIndex = validation.data.order_index;
    if (orderIndex === undefined) {
      const { count } = await serviceClient
        .from('activity_library_steps')
        .select('id', { count: 'exact', head: true })
        .eq('activity_id', activityId);
      orderIndex = count || 0;
    }

    const { data: step, error } = await serviceClient
      .from('activity_library_steps')
      .insert({
        activity_id: activityId,
        title: validation.data.title,
        instruction_markdown: validation.data.instruction_markdown,
        order_index: orderIndex,
        estimated_minutes: validation.data.estimated_minutes ?? null,
        is_required: validation.data.is_required,
        ai_tool_name: validation.data.ai_tool_name ?? null,
        ai_tool_url: validation.data.ai_tool_url ?? null,
      })
      .select('id, title, instruction_markdown, order_index, estimated_minutes, is_required, ai_tool_name, ai_tool_url')
      .single();

    if (error) {
      console.error('Library step creation error:', error);
      return NextResponse.json({ success: false, error: 'Failed to create step' }, { status: 500 });
    }

    revalidatePath('/admin/modules');
    return NextResponse.json({ success: true, data: step });
  } catch (error) {
    console.error('Library steps POST error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
