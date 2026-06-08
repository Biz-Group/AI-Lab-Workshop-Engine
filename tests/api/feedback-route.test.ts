import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createServiceClientMock = vi.fn();
const requireParticipantSessionMock = vi.fn();
const checkRateLimitMock = vi.fn();
const rateLimitResponseMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
}));

vi.mock('@/lib/server/participant-session', () => ({
  requireParticipantSession: requireParticipantSessionMock,
}));

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitResponse: rateLimitResponseMock,
}));

function createRequest(feedback: string) {
  return new NextRequest('http://localhost/api/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-1',
    },
    body: JSON.stringify({
      sessionId: '11111111-1111-1111-1111-111111111111',
      participantId: '22222222-2222-2222-2222-222222222222',
      rating: 5,
      feedback,
      mostValuable: 'Useful section',
    }),
  });
}

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireParticipantSessionMock.mockResolvedValue({
      payload: {
        session_id: '11111111-1111-1111-1111-111111111111',
        participant_id: '22222222-2222-2222-2222-222222222222',
        display_name: 'Alex',
        exp: 1,
        iat: 1,
      },
      response: null,
    });
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    rateLimitResponseMock.mockReturnValue(new Response(null, { status: 429 }));
  });

  it('rejects oversized feedback payloads', async () => {
    const { POST } = await import('@/app/api/feedback/route');
    const response = await POST(createRequest('a'.repeat(3001)));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });
});

