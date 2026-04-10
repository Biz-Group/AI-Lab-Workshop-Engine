import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createServiceClientMock = vi.fn();
const verifySessionTokenMock = vi.fn();
const buildPromptPackDataMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
}));

vi.mock('@/lib/utils/session-token', () => ({
  verifySessionToken: verifySessionTokenMock,
}));

vi.mock('@/lib/server/prompt-pack', () => ({
  buildPromptPackData: buildPromptPackDataMock,
}));

function createRequest() {
  return new NextRequest('http://localhost/api/email/prompt-pack', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-1',
    },
    body: JSON.stringify({
      sessionId: '11111111-1111-1111-1111-111111111111',
      participantId: '22222222-2222-2222-2222-222222222222',
      email: 'alex@example.com',
    }),
  });
}

describe('POST /api/email/prompt-pack', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.RESEND_API_KEY = 'resend-key';

    verifySessionTokenMock.mockResolvedValue({
      session_id: '11111111-1111-1111-1111-111111111111',
      participant_id: '22222222-2222-2222-2222-222222222222',
    });

    const participantBuilder = {
      select: vi.fn(() => participantBuilder),
      eq: vi.fn(() => participantBuilder),
      single: vi.fn(async () => ({
        data: {
          id: '22222222-2222-2222-2222-222222222222',
          display_name: 'Alex',
          session_id: '11111111-1111-1111-1111-111111111111',
          feedback_submitted: true,
        },
        error: null,
      })),
    };

    const participantUpdateBuilder = {
      update: vi.fn(() => participantUpdateBuilder),
      eq: vi.fn(async () => ({ error: null })),
    };

    const sessionBuilder = {
      select: vi.fn(() => sessionBuilder),
      eq: vi.fn(() => sessionBuilder),
      single: vi.fn(async () => ({
        data: { organization_id: 'org-1' },
        error: null,
      })),
    };

    const leadsBuilder = {
      upsert: vi.fn(async () => ({ error: null })),
    };

    createServiceClientMock.mockResolvedValue({
      from: vi
        .fn()
        .mockImplementationOnce(() => participantBuilder)
        .mockImplementationOnce(() => participantUpdateBuilder)
        .mockImplementationOnce(() => sessionBuilder)
        .mockImplementationOnce(() => leadsBuilder),
    });

    buildPromptPackDataMock.mockResolvedValue({
      participantName: 'Alex',
      sessionDate: '04/10/2026',
      organizationName: 'Biz Group',
      workshopName: 'Prompt Lab',
      entries: [
        {
          moduleTitle: 'Discovery',
          stepTitle: 'Persona Prompt',
          stepInstructions: { actions: 'Describe your audience' },
          promptBlocks: [{ title: 'Starter Prompt', content: 'Act as...', isCopyable: true }],
          participantResponse: { content: 'Audience draft', imageUrl: null, submittedAt: null, updatedAt: null },
        },
      ],
      takeaways: [],
    });

    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'email-1' }),
    })) as unknown as typeof fetch;
  });

  it('reuses the shared prompt-pack builder for email content', async () => {
    const { POST } = await import('@/app/api/email/prompt-pack/route');
    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(buildPromptPackDataMock).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222'
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({
      method: 'POST',
    });
  });
});
