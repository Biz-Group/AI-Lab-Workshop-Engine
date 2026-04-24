import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createServiceClientMock = vi.fn();
const readParticipantSessionMock = vi.fn();
const createSessionTokenMock = vi.fn();
const setSessionTokenCookieMock = vi.fn();
const checkRateLimitMock = vi.fn();
const rateLimitResponseMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
}));

vi.mock('@/lib/server/participant-session', () => ({
  readParticipantSession: readParticipantSessionMock,
}));

vi.mock('@/lib/utils/session-token', () => ({
  createSessionToken: createSessionTokenMock,
  setSessionTokenCookie: setSessionTokenCookieMock,
}));

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitResponse: rateLimitResponseMock,
}));

function createJoinRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/sessions/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/sessions/join', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    checkRateLimitMock.mockReturnValue({ allowed: true });
    readParticipantSessionMock.mockResolvedValue(null);
    createSessionTokenMock.mockResolvedValue('signed-token');
    setSessionTokenCookieMock.mockResolvedValue(undefined);
    rateLimitResponseMock.mockReturnValue(new Response(null, { status: 429 }));
  });

  it('creates a new participant when no matching email exists', async () => {
    const sessionBuilder = {
      select: vi.fn(() => sessionBuilder),
      eq: vi.fn(() => sessionBuilder),
      in: vi.fn(() => sessionBuilder),
      single: vi.fn(async () => ({
        data: { id: 'session-1', status: 'live', organization_id: 'org-1' },
        error: null,
      })),
    };

    const participantInsertBuilder = {
      insert: vi.fn(() => participantInsertBuilder),
      select: vi.fn(() => participantInsertBuilder),
      single: vi.fn(async () => ({
        data: { id: 'participant-new', display_name: 'Alex' },
        error: null,
      })),
    };

    const analyticsBuilder = {
      insert: vi.fn(async () => ({ error: null })),
    };

    createServiceClientMock.mockResolvedValue({
      from: vi
        .fn()
        .mockImplementationOnce(() => sessionBuilder)
        .mockImplementationOnce(() => participantInsertBuilder)
        .mockImplementationOnce(() => analyticsBuilder),
    });

    const { POST } = await import('@/app/api/sessions/join/route');
    const response = await POST(createJoinRequest({
      sessionId: '11111111-1111-1111-1111-111111111111',
      displayName: 'Alex',
      email: 'alex@example.com',
      emailConsent: true,
      marketingConsent: false,
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(participantInsertBuilder.insert).toHaveBeenCalledWith({
      session_id: '11111111-1111-1111-1111-111111111111',
      display_name: 'Alex',
      email: 'alex@example.com',
      email_consent: true,
      marketing_consent: false,
    });
    expect(createSessionTokenMock).toHaveBeenCalledWith(
      'participant-new',
      '11111111-1111-1111-1111-111111111111',
      'Alex'
    );
  });

  it('resumes the existing participant when the browser already has a valid session token', async () => {
    const sessionBuilder = {
      select: vi.fn(() => sessionBuilder),
      eq: vi.fn(() => sessionBuilder),
      in: vi.fn(() => sessionBuilder),
      single: vi.fn(async () => ({
        data: { id: 'session-1', status: 'live', organization_id: 'org-1' },
        error: null,
      })),
    };

    const participantUpdateBuilder = {
      update: vi.fn(() => participantUpdateBuilder),
      eq: vi.fn(() => participantUpdateBuilder),
      select: vi.fn(() => participantUpdateBuilder),
      single: vi.fn(async () => ({
        data: { id: 'participant-existing', display_name: 'Alex' },
        error: null,
      })),
    };

    const analyticsBuilder = {
      insert: vi.fn(async () => ({ error: null })),
    };

    readParticipantSessionMock.mockResolvedValue({
      participant_id: 'participant-existing',
      session_id: '11111111-1111-1111-1111-111111111111',
      display_name: 'Alex',
      exp: 1,
      iat: 1,
    });

    createServiceClientMock.mockResolvedValue({
      from: vi
        .fn()
        .mockImplementationOnce(() => sessionBuilder)
        .mockImplementationOnce(() => participantUpdateBuilder)
        .mockImplementationOnce(() => analyticsBuilder),
    });

    const { POST } = await import('@/app/api/sessions/join/route');
    const response = await POST(createJoinRequest({
      sessionId: '11111111-1111-1111-1111-111111111111',
      displayName: 'Alex',
      email: 'Alex@Example.com',
      emailConsent: true,
      marketingConsent: false,
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(participantUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        display_name: 'Alex',
        email: 'alex@example.com',
        email_consent: true,
        marketing_consent: false,
      })
    );
    expect(createSessionTokenMock).toHaveBeenCalledWith(
      'participant-existing',
      '11111111-1111-1111-1111-111111111111',
      'Alex'
    );
  });
});
