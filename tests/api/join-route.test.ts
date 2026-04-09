import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createServiceClientMock = vi.fn();
const createSessionTokenMock = vi.fn();
const setSessionTokenCookieMock = vi.fn();
const checkRateLimitMock = vi.fn();
const rateLimitResponseMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
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

    const participantLookupBuilder = {
      select: vi.fn(() => participantLookupBuilder),
      eq: vi.fn(() => participantLookupBuilder),
      ilike: vi.fn(() => participantLookupBuilder),
      order: vi.fn(() => participantLookupBuilder),
      limit: vi.fn(async () => ({ data: [], error: null })),
    };

    const participantInsertBuilder = {
      insert: vi.fn(() => participantInsertBuilder),
      select: vi.fn(() => participantInsertBuilder),
      single: vi.fn(async () => ({
        data: { id: 'participant-new', display_name: 'Alex' },
        error: null,
      })),
    };

    createServiceClientMock.mockResolvedValue({
      from: vi
        .fn()
        .mockImplementationOnce(() => sessionBuilder)
        .mockImplementationOnce(() => participantLookupBuilder)
        .mockImplementationOnce(() => participantInsertBuilder),
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

  it('reuses an existing participant when the same session email joins again', async () => {
    const sessionBuilder = {
      select: vi.fn(() => sessionBuilder),
      eq: vi.fn(() => sessionBuilder),
      in: vi.fn(() => sessionBuilder),
      single: vi.fn(async () => ({
        data: { id: 'session-1', status: 'live', organization_id: 'org-1' },
        error: null,
      })),
    };

    const participantLookupBuilder = {
      select: vi.fn(() => participantLookupBuilder),
      eq: vi.fn(() => participantLookupBuilder),
      ilike: vi.fn(() => participantLookupBuilder),
      order: vi.fn(() => participantLookupBuilder),
      limit: vi.fn(async () => ({
        data: [
          {
            id: 'participant-existing',
            display_name: 'Alex',
            email_consent: false,
            marketing_consent: false,
          },
        ],
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

    createServiceClientMock.mockResolvedValue({
      from: vi
        .fn()
        .mockImplementationOnce(() => sessionBuilder)
        .mockImplementationOnce(() => participantLookupBuilder)
        .mockImplementationOnce(() => participantUpdateBuilder),
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
    expect(participantUpdateBuilder.update).toHaveBeenCalled();
    expect(createSessionTokenMock).toHaveBeenCalledWith(
      'participant-existing',
      '11111111-1111-1111-1111-111111111111',
      'Alex'
    );
  });
});
