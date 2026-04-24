import { NextRequest, NextResponse } from 'next/server';
import type { SessionToken } from '@/lib/types';
import { verifySessionToken } from '@/lib/utils/session-token';

interface ParticipantSessionExpectation {
  participantId?: string;
  sessionId?: string;
}

interface ParticipantSessionSuccess {
  payload: SessionToken;
  response: null;
}

interface ParticipantSessionFailure {
  payload: null;
  response: NextResponse;
}

export type ParticipantSessionResult =
  | ParticipantSessionSuccess
  | ParticipantSessionFailure;

export function getParticipantTokenFromRequest(request: NextRequest) {
  const cookieToken =
    request.cookies.get('workshop_session_token')?.value ||
    request.cookies.get('session_token')?.value;

  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    return bearerToken.length > 0 ? bearerToken : null;
  }

  return null;
}

export async function readParticipantSession(
  request: NextRequest
): Promise<SessionToken | null> {
  const token = getParticipantTokenFromRequest(request);
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireParticipantSession(
  request: NextRequest,
  expected: ParticipantSessionExpectation = {}
): Promise<ParticipantSessionResult> {
  const token = getParticipantTokenFromRequest(request);
  if (!token) {
    return {
      payload: null,
      response: NextResponse.json(
        { success: false, error: 'Missing session token' },
        { status: 401 }
      ),
    };
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return {
      payload: null,
      response: NextResponse.json(
        { success: false, error: 'Invalid or expired session token' },
        { status: 401 }
      ),
    };
  }

  if (
    (expected.participantId && payload.participant_id !== expected.participantId) ||
    (expected.sessionId && payload.session_id !== expected.sessionId)
  ) {
    return {
      payload: null,
      response: NextResponse.json(
        { success: false, error: 'Token mismatch' },
        { status: 403 }
      ),
    };
  }

  return { payload, response: null };
}
