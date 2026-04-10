import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const verifySessionTokenMock = vi.fn();
const buildPromptPackDataMock = vi.fn();
const renderPromptPackPdfMock = vi.fn();

vi.mock('@/lib/utils/session-token', () => ({
  verifySessionToken: verifySessionTokenMock,
}));

vi.mock('@/lib/server/prompt-pack', () => ({
  buildPromptPackData: buildPromptPackDataMock,
}));

vi.mock('@/lib/server/render-pdf', () => ({
  renderPromptPackPdf: renderPromptPackPdfMock,
}));

function createRequest() {
  return new NextRequest('http://localhost/api/pdf/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-1',
    },
    body: JSON.stringify({
      sessionId: '11111111-1111-1111-1111-111111111111',
      participantId: '22222222-2222-2222-2222-222222222222',
    }),
  });
}

describe('POST /api/pdf/generate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    verifySessionTokenMock.mockResolvedValue({
      session_id: '11111111-1111-1111-1111-111111111111',
      participant_id: '22222222-2222-2222-2222-222222222222',
    });
    buildPromptPackDataMock.mockResolvedValue({
      participantName: 'Alex',
      sessionDate: '04/10/2026',
      organizationName: 'Biz Group',
      workshopName: 'Prompt Lab',
      entries: [],
      takeaways: [],
    });
    renderPromptPackPdfMock.mockResolvedValue(Buffer.from('pdf-data'));
  });

  it('returns a real pdf attachment', async () => {
    const { POST } = await import('@/app/api/pdf/generate/route');
    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('.pdf');
    expect(buildPromptPackDataMock).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222'
    );
    expect(renderPromptPackPdfMock).toHaveBeenCalledTimes(1);
  });

  it('returns a 500 json error when pdf rendering fails', async () => {
    renderPromptPackPdfMock.mockRejectedValueOnce(new Error('render failed'));

    const { POST } = await import('@/app/api/pdf/generate/route');
    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Unable to export prompt pack PDF');
  });
});
