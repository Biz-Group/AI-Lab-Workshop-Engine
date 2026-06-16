import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  estimated_duration_minutes: z.number().int().min(1).max(600).optional(),
  is_published: z.boolean().optional(),
  ai_tool_name: z.string().min(1).max(100).optional(),
  ai_tool_url: z.string().url().max(2000).optional(),
});

async function verifyAccess(supabase: ReturnType<typeof createServiceClient> extends Promise<infer T> ? T : never, templateId: string, userId: string) {
  const { data } = await supabase
    .from('workshop_templates')
    .select(`
      id,
      organization:organizations!inner(
        id,
        facilitator_users!inner(user_id)
      )
    `)
    .eq('id', templateId)
    .eq('organization.facilitator_users.user_id', userId)
    .single();
  return data;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { templateId } = await params;
    const serviceClient = await createServiceClient();

    // Verify the template belongs to the user's organization
    const access = await verifyAccess(serviceClient, templateId, user.id);
    if (!access) {
      return NextResponse.json({ success: false, error: 'Template not found or access denied' }, { status: 404 });
    }

    const { data: template, error } = await serviceClient
      .from('workshop_templates')
      .select(`
        id,
        name,
        description,
        estimated_duration_minutes,
        is_published,
        ai_tool_name,
        ai_tool_url,
        created_at,
        modules(
          id,
          title,
          objective,
          order_index,
          steps:module_steps(
            id,
            title,
            instruction_markdown,
            order_index,
            estimated_minutes,
            is_required,
            show_response_field,
            ai_tool_name,
            ai_tool_url,
            prompt_blocks(
              id,
              title,
              content_markdown,
              order_index,
              is_copyable
            )
          )
        )
      `)
      .eq('id', templateId)
      .single();

    if (error || !template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    // Sort modules and steps by order_index
    const sortedTemplate = {
      ...template,
      modules: template.modules
        ?.sort((a, b) => a.order_index - b.order_index)
        .map(m => ({
          ...m,
          steps: m.steps
            ?.sort((a, b) => a.order_index - b.order_index)
            .map(s => ({
              ...s,
              prompt_blocks: s.prompt_blocks?.sort((a, b) => a.order_index - b.order_index),
            })),
        })),
    };

    return NextResponse.json({ success: true, data: sortedTemplate });
  } catch (error) {
    console.error('Template GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { templateId } = await params;
    const serviceClient = await createServiceClient();
    const access = await verifyAccess(serviceClient, templateId, user.id);

    if (!access) {
      return NextResponse.json({ success: false, error: 'Template not found or access denied' }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateTemplateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const updateData = {
      ...validation.data,
      ...(validation.data.description !== undefined && {
        description: validation.data.description || null,
      }),
    };

    const { error } = await serviceClient
      .from('workshop_templates')
      .update(updateData)
      .eq('id', templateId);

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to update template' }, { status: 500 });
    }

    revalidatePath('/admin/templates');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Template PATCH error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { templateId } = await params;
    const serviceClient = await createServiceClient();
    const access = await verifyAccess(serviceClient, templateId, user.id);

    if (!access) {
      return NextResponse.json({ success: false, error: 'Template not found or access denied' }, { status: 404 });
    }

    // Check if template is used by any active sessions
    const { count } = await serviceClient
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', templateId)
      .in('status', ['published', 'live']);

    if (count && count > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete a template used by active sessions' },
        { status: 409 }
      );
    }

    // CASCADE will handle modules → steps → prompt_blocks
    const { error } = await serviceClient
      .from('workshop_templates')
      .delete()
      .eq('id', templateId);

    if (error) {
      console.error('Template delete error:', error);
      return NextResponse.json({ success: false, error: 'Failed to delete template' }, { status: 500 });
    }

    revalidatePath('/admin/templates');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Template DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
