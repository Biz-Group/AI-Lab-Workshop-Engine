import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type React from 'react';

const verifySessionTokenMock = vi.fn();
const buildPromptPackDataMock = vi.fn();
const renderToBufferMock = vi.fn();

vi.mock('@/lib/utils/session-token', () => ({
  verifySessionToken: verifySessionTokenMock,
}));

vi.mock('@/lib/server/prompt-pack', () => ({
  buildPromptPackData: buildPromptPackDataMock,
}));

vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: renderToBufferMock,
  Document: ({ children }: { children: React.ReactNode }) => children,
  Page: ({ children }: { children: React.ReactNode }) => children,
  Text: ({ children }: { children: React.ReactNode }) => children,
  View: ({ children }: { children: React.ReactNode }) => children,
  StyleSheet: {
    create: (styles: unknown) => styles,
  },
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
    renderToBufferMock.mockResolvedValue(Buffer.from('pdf-data'));
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
    expect(renderToBufferMock).toHaveBeenCalledTimes(1);
  });
});
