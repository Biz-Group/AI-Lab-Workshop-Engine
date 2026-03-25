import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const updateStepSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  instruction_markdown: z.string().optional(),
  estimated_minutes: z.number().int().min(1).nullable().optional(),
  is_required: z.boolean().optional(),
  ai_tool_name: z.string().max(100).nullable().optional(),
  ai_tool_url: z.string().url().max(500).nullable().optional(),
  order_index: z.number().int().min(0).optional(),
});

async function verifyStepAccess(serviceClient: Awaited<ReturnType<typeof createServiceClient>>, stepId: string, userId: string) {
  const { data } = await serviceClient
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
    .eq('activity.organization.facilitator_users.user_id', userId)
    .single();
  return data;
}

export async function PATCH(
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

    const access = await verifyStepAccess(serviceClient, stepId, user.id);
    if (!access) {
      return NextResponse.json({ success: false, error: 'Step not found or access denied' }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateStepSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const { error } = await serviceClient
      .from('activity_library_steps')
      .update(validation.data)
      .eq('id', stepId);

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to update step' }, { status: 500 });
    }

    revalidatePath('/admin/modules');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Library step PATCH error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
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

    const access = await verifyStepAccess(serviceClient, stepId, user.id);
    if (!access) {
      return NextResponse.json({ success: false, error: 'Step not found or access denied' }, { status: 404 });
    }

    const { error } = await serviceClient
      .from('activity_library_steps')
      .delete()
      .eq('id', stepId);

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to delete step' }, { status: 500 });
    }

    revalidatePath('/admin/modules');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Library step DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
