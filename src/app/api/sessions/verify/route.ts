import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getTrustedClientIp } from '@/lib/server/request-ip';
import { isValidJoinCodeFormat, normalizeJoinCode } from '@/lib/utils';
import { getJoinField } from '@/lib/utils/supabase-join';
import { checkRateLimit, rateLimitResponse } from '@/lib/utils/rate-limit';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json(
      { success: false, error: 'Join code is required' },
      { status: 400 }
    );
  }

  try {
    if (!isValidJoinCodeFormat(code)) {
      return NextResponse.json(
        { success: false, error: 'Invalid join code format' },
        { status: 400 }
      );
    }

    const ip = getTrustedClientIp(request);
    const normalizedCode = normalizeJoinCode(code);
    const rlByIp = await checkRateLimit(`verify:ip:${ip}`, 20, 60_000);
    if (!rlByIp.allowed) return rateLimitResponse(rlByIp.resetAt);
    const rlByCode = await checkRateLimit(`verify:code:${normalizedCode}`, 120, 60_000);
    if (!rlByCode.allowed) return rateLimitResponse(rlByCode.resetAt);

    const supabase = await createServiceClient();

    // Find session with this join code that is published or live
    const { data: session, error } = await supabase
      .from('sessions')
      .select(`
        id,
        status,
        organization:organizations(name),
        template:workshop_templates(name, description, estimated_duration_minutes)
      `)
      .ilike('join_code', normalizedCode)
      .in('status', ['published', 'live'])
      .single();

    if (error || !session) {
      return NextResponse.json(
        { success: false, error: 'Session not found or has ended' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        session: {
          id: session.id,
          status: session.status,
          organizationName: getJoinField(session.organization, 'name') || 'Workshop',
          templateName: getJoinField(session.template, 'name') || 'Session',
          templateDescription: getJoinField(session.template, 'description') || null,
          estimatedDurationMinutes: getJoinField(session.template, 'estimated_duration_minutes') || null,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
        },
      }
    );
  } catch (err) {
    console.error('Session verification error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
