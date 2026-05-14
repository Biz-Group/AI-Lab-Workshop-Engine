import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient, createServiceClient } from '@/lib/supabase/server';
import { createSessionToken } from '@/lib/utils/session-token';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await params;
    const serviceClient = await createServiceClient();

    // Verify session belongs to user's org
    const { data: facilitator } = await serviceClient
      .from('facilitator_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!facilitator) {
      return NextResponse.json({ success: false, error: 'Facilitator not found' }, { status: 403 });
    }

    const { data: session } = await serviceClient
      .from('sessions')
      .select('id, organization_id')
      .eq('id', sessionId)
      .eq('organization_id', facilitator.organization_id)
      .single();

    if (!session) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    // Upsert a "Facilitator Preview" participant for this session
    const { data: existingParticipant } = await serviceClient
      .from('participants')
      .select('id')
      .eq('session_id', sessionId)
      .eq('display_name', 'Facilitator Preview')
      .single();

    let participantId: string;

    if (existingParticipant) {
      participantId = existingParticipant.id;
    } else {
      const { data: newParticipant, error: insertErr } = await serviceClient
        .from('participants')
        .insert({
          session_id: sessionId,
          display_name: 'Facilitator Preview',
        })
        .select('id')
        .single();

      if (insertErr || !newParticipant) {
        return NextResponse.json({ success: false, error: 'Failed to create preview participant' }, { status: 500 });
      }
      participantId = newParticipant.id;
    }

    // Create session token
    const token = await createSessionToken(participantId, sessionId, 'Facilitator Preview');

    // Set the cookie and return success
    const response = NextResponse.json({ success: true });
    response.cookies.set('workshop_session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Preview token error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
