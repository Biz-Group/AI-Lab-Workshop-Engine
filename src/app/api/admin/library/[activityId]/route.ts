import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const updateActivitySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  objective: z.string().max(2000).nullable().optional(),
});

async function verifyAccess(serviceClient: Awaited<ReturnType<typeof createServiceClient>>, activityId: string, userId: string) {
  const { data } = await serviceClient
    .from('activity_library')
    .select(`
      id,
      organization:organizations!inner(
        facilitator_users!inner(user_id)
      )
    `)
    .eq('id', activityId)
    .eq('organization.facilitator_users.user_id', userId)
    .single();
  return data;
}

export async function GET(
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

    const access = await verifyAccess(serviceClient, activityId, user.id);
    if (!access) {
      return NextResponse.json({ success: false, error: 'Activity not found or access denied' }, { status: 404 });
    }

    const { data: activity, error } = await serviceClient
      .from('activity_library')
      .select(`
        id,
        title,
        objective,
        created_at,
        updated_at,
        steps:activity_library_steps(
          id,
          title,
          instruction_markdown,
          order_index,
          estimated_minutes,
          is_required,
          ai_tool_name,
          ai_tool_url,
          prompt_blocks:activity_library_prompt_blocks(
            id,
            title,
            content_markdown,
            order_index,
            is_copyable
          )
        )
      `)
      .eq('id', activityId)
      .single();

    if (error) {
      console.error('Library activity fetch error:', error);
      return NextResponse.json({ success: false, error: 'Failed to load activity' }, { status: 500 });
    }

    // Sort steps and their blocks by order_index
    if (activity.steps && Array.isArray(activity.steps)) {
      activity.steps.sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index);
      for (const step of activity.steps) {
        if ((step as { prompt_blocks?: { order_index: number }[] }).prompt_blocks) {
          (step as { prompt_blocks: { order_index: number }[] }).prompt_blocks.sort(
            (a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index
          );
        }
      }
    }

    return NextResponse.json({ success: true, data: activity });
  } catch (error) {
    console.error('Library activity GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
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

    const access = await verifyAccess(serviceClient, activityId, user.id);
    if (!access) {
      return NextResponse.json({ success: false, error: 'Activity not found or access denied' }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateActivitySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const { error } = await serviceClient
      .from('activity_library')
      .update(validation.data)
      .eq('id', activityId);

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to update activity' }, { status: 500 });
    }

    revalidatePath('/admin/modules');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Library activity PATCH error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
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

    const access = await verifyAccess(serviceClient, activityId, user.id);
    if (!access) {
      return NextResponse.json({ success: false, error: 'Activity not found or access denied' }, { status: 404 });
    }

    const { error } = await serviceClient
      .from('activity_library')
      .delete()
      .eq('id', activityId);

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to delete activity' }, { status: 500 });
    }

    revalidatePath('/admin/modules');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Library activity DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
