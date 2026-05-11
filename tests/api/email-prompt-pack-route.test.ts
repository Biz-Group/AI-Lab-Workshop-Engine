import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createServiceClientMock = vi.fn();
const requireParticipantSessionMock = vi.fn();
const buildPromptPackDataMock = vi.fn();
const renderPromptPackPdfMock = vi.fn();
const sendPromptPackViaWebhookMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
}));

vi.mock('@/lib/server/participant-session', () => ({
  requireParticipantSession: requireParticipantSessionMock,
}));

vi.mock('@/lib/server/prompt-pack', () => ({
  buildPromptPackData: buildPromptPackDataMock,
}));

vi.mock('@/lib/server/render-pdf', () => ({
  renderPromptPackPdf: renderPromptPackPdfMock,
}));

vi.mock('@/lib/server/n8n', () => ({
  sendPromptPackViaWebhook: sendPromptPackViaWebhookMock,
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

    // Fifth call: update prompt_pack_emailed_at
    const emailedUpdateBuilder = {
      update: vi.fn(() => emailedUpdateBuilder),
      eq: vi.fn(() => emailedUpdateBuilder),
    };

    createServiceClientMock.mockResolvedValue({
      from: vi
        .fn()
        .mockImplementationOnce(() => participantBuilder)
        .mockImplementationOnce(() => participantUpdateBuilder)
        .mockImplementationOnce(() => sessionBuilder)
        .mockImplementationOnce(() => leadsBuilder)
        .mockImplementationOnce(() => emailedUpdateBuilder),
    });

    buildPromptPackDataMock.mockResolvedValue({
      participantName: 'Alex',
      sessionDate: '04/10/2026',
      organizationName: 'Biz Group',
      workshopName: 'Prompt Lab',
      entries: [],
      takeaways: [],
    });

    renderPromptPackPdfMock.mockResolvedValue(Buffer.from('fake-pdf-content'));
    sendPromptPackViaWebhookMock.mockResolvedValue({ success: true });
  });

  it('generates PDF and sends via n8n webhook', async () => {
    const { POST } = await import('@/app/api/email/prompt-pack/route');
    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(buildPromptPackDataMock).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222'
    );
    expect(renderPromptPackPdfMock).toHaveBeenCalledTimes(1);
    expect(sendPromptPackViaWebhookMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alex@example.com',
        participantName: 'Alex',
        workshopName: 'Prompt Lab',
        organizationName: 'Biz Group',
        filename: 'prompt-pack-alex.pdf',
      })
    );
    // Verify pdfBase64 is passed
    const webhookCall = sendPromptPackViaWebhookMock.mock.calls[0][0];
    expect(webhookCall.pdfBase64).toBe(Buffer.from('fake-pdf-content').toString('base64'));
  });

  it('returns 502 when n8n webhook fails', async () => {
    sendPromptPackViaWebhookMock.mockResolvedValue({
      success: false,
      error: 'n8n webhook returned 500',
    });

    const { POST } = await import('@/app/api/email/prompt-pack/route');
    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.success).toBe(false);
    expect(data.error).toContain('n8n webhook returned 500');
  });

  it('returns 403 if feedback not submitted', async () => {
    const participantBuilder = {
      select: vi.fn(() => participantBuilder),
      eq: vi.fn(() => participantBuilder),
      single: vi.fn(async () => ({
        data: {
          id: '22222222-2222-2222-2222-222222222222',
          display_name: 'Alex',
          session_id: '11111111-1111-1111-1111-111111111111',
          feedback_submitted: false,
        },
        error: null,
      })),
    };

    createServiceClientMock.mockResolvedValue({
      from: vi.fn().mockImplementationOnce(() => participantBuilder),
    });

    const { POST } = await import('@/app/api/email/prompt-pack/route');
    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.success).toBe(false);
  });
});
