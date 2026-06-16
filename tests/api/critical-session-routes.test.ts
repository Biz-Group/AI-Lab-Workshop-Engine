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

function createRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init);
}

function createSingleBuilder(data: unknown, error: unknown = null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    in: vi.fn(() => builder),
    single: vi.fn(async () => ({ data, error })),
  };
  return builder;
}

describe('critical session API routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    rateLimitResponseMock.mockReturnValue(new Response(null, { status: 429 }));
    requireParticipantSessionMock.mockResolvedValue({
      payload: {
        participant_id: '22222222-2222-2222-2222-222222222222',
        session_id: '11111111-1111-1111-1111-111111111111',
        display_name: 'Alex',
      },
      response: null,
    });
  });

  it('verifies a valid join code and maps joined organization/template fields', async () => {
    createServiceClientMock.mockResolvedValue({
      from: vi.fn(() =>
        createSingleBuilder({
          id: 'session-1',
          status: 'live',
          organization: { name: 'Biz Group' },
          template: {
            name: 'AI Workshop',
            description: 'Learn prompts',
            estimated_duration_minutes: 60,
          },
        })
      ),
    });

    const { GET } = await import('@/app/api/sessions/verify/route');
    const response = await GET(createRequest('http://localhost/api/sessions/verify?code=ABCD'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      session: {
        id: 'session-1',
        status: 'live',
        organizationName: 'Biz Group',
        templateName: 'AI Workshop',
        templateDescription: 'Learn prompts',
        estimatedDurationMinutes: 60,
      },
    });
  });

  it('returns validation errors for missing session state ids', async () => {
    const { GET } = await import('@/app/api/sessions/state/route');
    const response = await GET(createRequest('http://localhost/api/sessions/state'));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('returns current session state for an authenticated participant', async () => {
    createServiceClientMock.mockResolvedValue({
      from: vi.fn(() =>
        createSingleBuilder({
          id: '11111111-1111-1111-1111-111111111111',
          status: 'live',
          current_step_id: 'step-1',
          timer_end_at: '2026-01-01T00:15:00Z',
        })
      ),
    });

    const { GET } = await import('@/app/api/sessions/state/route');
    const response = await GET(
      createRequest('http://localhost/api/sessions/state?sessionId=11111111-1111-1111-1111-111111111111')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session).toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      status: 'live',
      currentStepId: 'step-1',
      timerEndAt: '2026-01-01T00:15:00Z',
    });
  });

  it('records analytics events and updates participant last seen', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq: vi.fn(() => ({ eq })) }));
    createServiceClientMock.mockResolvedValue({
      from: vi
        .fn()
        .mockImplementationOnce(() => ({ insert }))
        .mockImplementationOnce(() => ({ update })),
    });

    const { POST } = await import('@/app/api/analytics/event/route');
    const response = await POST(
      createRequest('http://localhost/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: '22222222-2222-2222-2222-222222222222',
          sessionId: '11111111-1111-1111-1111-111111111111',
          eventType: 'step_viewed',
          payload: { stepId: 'step-1' },
        }),
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        participant_id: '22222222-2222-2222-2222-222222222222',
        session_id: '11111111-1111-1111-1111-111111111111',
        event_type: 'step_viewed',
        payload: { stepId: 'step-1' },
      })
    );
  });
});
