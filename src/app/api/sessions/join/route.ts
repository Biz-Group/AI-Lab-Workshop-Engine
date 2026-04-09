import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
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

    // Rate limit: 10 join attempts per minute per IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rl = checkRateLimit(`join:${ip}`, 10, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

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

    if (normalizedEmail) {
      const { data: existingParticipants, error: existingParticipantError } = await supabase
        .from('participants')
        .select('id, display_name, email_consent, marketing_consent')
        .eq('session_id', validatedData.sessionId)
        .ilike('email', normalizedEmail)
        .order('joined_at', { ascending: false })
        .limit(5);

      if (existingParticipantError) {
        console.error('Participant lookup error:', existingParticipantError);
      }

      const matchedParticipant = existingParticipants?.find((row) =>
        row.display_name.trim().toLowerCase() === normalizedDisplayName.toLowerCase()
      ) || existingParticipants?.[0];

      if (matchedParticipant) {
        const { data: updatedParticipant, error: participantUpdateError } = await supabase
          .from('participants')
          .update({
            display_name: normalizedDisplayName,
            email: normalizedEmail,
            email_consent: matchedParticipant.email_consent || validatedData.emailConsent,
            marketing_consent: matchedParticipant.marketing_consent || validatedData.marketingConsent,
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', matchedParticipant.id)
          .select('id, display_name')
          .single();

        if (participantUpdateError) {
          console.error('Participant resume update error:', participantUpdateError);
          return NextResponse.json(
            { success: false, error: 'Failed to resume session' },
            { status: 500 }
          );
        }

        participant = updatedParticipant;
      }
    }

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
      validatedData.displayName
    );

    // Set cookie
    await setSessionTokenCookie(token);

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
