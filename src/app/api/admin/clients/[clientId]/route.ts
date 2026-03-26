import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId } = await params;
    const serviceClient = await createServiceClient();

    const { data: facilitator } = await serviceClient
      .from('facilitator_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!facilitator) {
      return NextResponse.json({ success: false, error: 'Facilitator not found' }, { status: 403 });
    }

    // Verify client belongs to facilitator's org before deleting
    const { error } = await serviceClient
      .from('approved_clients')
      .delete()
      .eq('id', clientId)
      .eq('organization_id', facilitator.organization_id);

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to delete client' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Client DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
