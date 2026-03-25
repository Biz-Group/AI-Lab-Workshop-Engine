import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createBlockSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content_markdown: z.string().default(''),
  is_copyable: z.boolean().default(true),
  order_index: z.number().int().min(0).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ activityId: string; stepId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { stepId } = await params;
    const serviceClient = await createServiceClient();

    // Verify access: step → activity → org → facilitator
    const { data: step } = await serviceClient
      .from('activity_library_steps')
      .select(`
        id,
        activity:activity_library!inner(
          organization:organizations!inner(
            facilitator_users!inner(user_id)
          )
        )
      `)
      .eq('id', stepId)
      .eq('activity.organization.facilitator_users.user_id', user.id)
      .single();

    if (!step) {
      return NextResponse.json({ success: false, error: 'Step not found or access denied' }, { status: 404 });
    }

    const body = await request.json();
    const validation = createBlockSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    let orderIndex = validation.data.order_index;
    if (orderIndex === undefined) {
      const { count } = await serviceClient
        .from('activity_library_prompt_blocks')
        .select('id', { count: 'exact', head: true })
        .eq('library_step_id', stepId);
      orderIndex = count || 0;
    }

    const { data: block, error } = await serviceClient
      .from('activity_library_prompt_blocks')
      .insert({
        library_step_id: stepId,
        title: validation.data.title,
        content_markdown: validation.data.content_markdown,
        is_copyable: validation.data.is_copyable,
        order_index: orderIndex,
      })
      .select('id, title, content_markdown, order_index, is_copyable')
      .single();

    if (error) {
      console.error('Library block creation error:', error);
      return NextResponse.json({ success: false, error: 'Failed to create prompt block' }, { status: 500 });
    }

    revalidatePath('/admin/modules');
    return NextResponse.json({ success: true, data: block });
  } catch (error) {
    console.error('Library blocks POST error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
