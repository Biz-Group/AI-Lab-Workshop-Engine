import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { readParticipantSession } from '@/lib/server/participant-session';
import { getTrustedClientIp } from '@/lib/server/request-ip';
import { createSessionToken, setSessionTokenCookie } from '@/lib/utils/session-token';
import { checkRateLimit, rateLimitResponse } from '@/lib/utils/rate-limit';
import { z } from 'zod';

const joinSchema = z.object({
  sessionId: z.string().uuid(),
  displayName: z.string().min(2).max(50),
  email: z.string().email().nullable().optional(),
  emailConsent: z.boolean().default(false),
  marketingConsent: z.boolean().default(false),
});

function normalizeOptionalEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = joinSchema.parse(body);
    const normalizedEmail = normalizeOptionalEmail(validatedData.email);
    const normalizedDisplayName = validatedData.displayName.trim();

    // Rate limit: provider-trusted IP + session-scoped + optional email-scoped
    const ip = getTrustedClientIp(request);
    const rlByIp = await checkRateLimit(`join:ip:${ip}`, 10, 60_000);
    if (!rlByIp.allowed) return rateLimitResponse(rlByIp.resetAt);
    const rlBySessionIp = await checkRateLimit(`join:session-ip:${validatedData.sessionId}:${ip}`, 30, 60_000);
    if (!rlBySessionIp.allowed) return rateLimitResponse(rlBySessionIp.resetAt);
    if (normalizedEmail) {
      const rlByEmail = await checkRateLimit(`join:email:${validatedData.sessionId}:${normalizedEmail}`, 6, 5 * 60_000);
      if (!rlByEmail.allowed) return rateLimitResponse(rlByEmail.resetAt);
    }

    const supabase = await createServiceClient();

    // Verify session is still joinable
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, status, organization_id')
      .eq('id', validatedData.sessionId)
      .in('status', ['published', 'live'])
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: 'Session not found or has ended' },
        { status: 404 }
      );
    }

    let participant:
      | {
          id: string;
          display_name: string;
        }
      | null = null;

    // 1. Try resume via existing JWT cookie
    const existingParticipantSession = await readParticipantSession(request);
    if (existingParticipantSession?.session_id === validatedData.sessionId) {
      const { data: resumedParticipant, error: participantUpdateError } = await supabase
        .from('participants')
        .update({
          display_name: normalizedDisplayName,
          email: normalizedEmail,
          email_consent: validatedData.emailConsent,
          marketing_consent: validatedData.marketingConsent,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existingParticipantSession.participant_id)
        .eq('session_id', validatedData.sessionId)
        .select('id, display_name')
        .single();

      if (participantUpdateError) {
        console.error('Participant resume update error:', participantUpdateError);
        return NextResponse.json(
          { success: false, error: 'Failed to resume session' },
          { status: 500 }
        );
      }

      participant = resumedParticipant;
    }

    // 2. Fallback: resume via email match (handles expired cookie / different browser)
    if (!participant && normalizedEmail) {
      const { data: existingByEmail } = await supabase
        .from('participants')
        .select('id, display_name')
        .eq('session_id', validatedData.sessionId)
        .eq('email', normalizedEmail)
        .order('joined_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingByEmail) {
        if (!existingParticipantSession || existingParticipantSession.participant_id !== existingByEmail.id) {
          console.warn(
            'Accepted risk: email-based rejoin fallback used (possible impersonation vector)',
            { sessionId: validatedData.sessionId, participantId: existingByEmail.id }
          );
        }

        const { data: resumedParticipant, error: updateError } = await supabase
          .from('participants')
          .update({
            display_name: normalizedDisplayName,
            email_consent: validatedData.emailConsent,
            marketing_consent: validatedData.marketingConsent,
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', existingByEmail.id)
          .eq('session_id', validatedData.sessionId)
          .select('id, display_name')
          .single();

        if (!updateError && resumedParticipant) {
          participant = resumedParticipant;
        }
      }
    }

    // 3. Create new participant if no match found
    if (!participant) {
      const { data: createdParticipant, error: participantError } = await supabase
        .from('participants')
        .insert({
          session_id: validatedData.sessionId,
          display_name: normalizedDisplayName,
          email: normalizedEmail,
          email_consent: validatedData.emailConsent,
          marketing_consent: validatedData.marketingConsent,
        })
        .select('id, display_name')
        .single();

      if (participantError) {
        console.error('Participant creation error:', participantError);
        return NextResponse.json(
          { success: false, error: 'Failed to join session' },
          { status: 500 }
        );
      }

      participant = createdParticipant;
    }

    // If email provided and marketing consent given, create lead record
    if (normalizedEmail && validatedData.marketingConsent) {
      await supabase.from('leads').insert({
        email: normalizedEmail,
        display_name: normalizedDisplayName,
        session_id: validatedData.sessionId,
        organization_id: session.organization_id,
        marketing_consent: validatedData.marketingConsent,
      });
    }

    // Create session token
    const token = await createSessionToken(
      participant.id,
      validatedData.sessionId,
      normalizedDisplayName
    );

    // Set cookie
    await setSessionTokenCookie(token);

    const { error: analyticsError } = await supabase.from('analytics_events').insert([
      {
        participant_id: participant.id,
        session_id: validatedData.sessionId,
        event_type: 'join_verified',
        payload: {
          resumeMethod: participant.id === existingParticipantSession?.participant_id
            ? 'cookie'
            : normalizedEmail
              ? 'email-or-new'
              : 'new',
          ip,
        },
      },
      {
        participant_id: participant.id,
        session_id: validatedData.sessionId,
        event_type: 'join_completed',
      },
    ]);

    if (analyticsError) {
      console.error('Join analytics error:', analyticsError);
    }

    return NextResponse.json({
      success: true,
      participant: {
        id: participant.id,
        displayName: participant.display_name,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: err.errors },
        { status: 400 }
      );
    }
    
    console.error('Join error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
