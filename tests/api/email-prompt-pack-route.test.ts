import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createServiceClientMock = vi.fn();
const requireParticipantSessionMock = vi.fn();
const buildPromptPackDataMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
}));

vi.mock('@/lib/server/participant-session', () => ({
  requireParticipantSession: requireParticipantSessionMock,
}));

vi.mock('@/lib/server/prompt-pack', () => ({
  buildPromptPackData: buildPromptPackDataMock,
}));

const sendMailMock = vi.fn(
  async (_options: { to: string; html: string }) => ({ messageId: 'msg-1' })
);
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
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
    process.env.GMAIL_USER = 'test@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'app-password';
    sendMailMock.mockResolvedValue({ messageId: 'msg-1' });

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
      eq: vi.fn(() => participantUpdateBuilder),
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
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mailOptions = sendMailMock.mock.calls[0]![0];
    expect(mailOptions.to).toBe('alex@example.com');
    expect(mailOptions.html).toContain('Activity Instructions');
    expect(mailOptions.html).toContain('What To Do');
    expect(mailOptions.html).toContain('Describe your audience');
  });
});
