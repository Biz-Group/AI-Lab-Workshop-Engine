import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createClientSchema = z.object({
  name: z.string().min(1, 'Client name is required').max(200),
  poc_name: z.string().max(200).optional(),
  poc_email: z.string().email().max(200).optional().or(z.literal('')),
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

    const { data: clients, error } = await serviceClient
      .from('approved_clients')
      .select('id, name, poc_name, poc_email, created_at')
      .eq('organization_id', facilitator.organization_id)
      .order('name');

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to fetch clients' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: clients });
  } catch (error) {
    console.error('Clients GET error:', error);
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
    const validation = createClientSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error.errors[0].message }, { status: 400 });
    }

    const { data: client, error } = await serviceClient
      .from('approved_clients')
      .insert({
        organization_id: facilitator.organization_id,
        name: validation.data.name.trim(),
        poc_name: validation.data.poc_name?.trim() || null,
        poc_email: validation.data.poc_email?.trim() || null,
      })
      .select('id, name, poc_name, poc_email, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'Client name already exists' }, { status: 409 });
      }
      console.error('Client creation error:', error);
      return NextResponse.json({ success: false, error: 'Failed to create client' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: client });
  } catch (error) {
    console.error('Clients POST error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
