import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionEndClient } from '@/components/workshop/SessionEndClient';

const createObjectURLMock = vi.fn(() => 'blob:prompt-pack');
const revokeObjectURLMock = vi.fn();
const appendChildMock = vi.spyOn(document.body, 'appendChild');
const removeChildMock = vi.spyOn(document.body, 'removeChild');

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('next/image', () => ({
  default: (props: any) => <img {...props} alt={props.alt || ''} />,
}));

vi.mock('@/components/workshop/FeedbackForm', () => ({
  FeedbackForm: () => <div>Feedback Form</div>,
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SessionEndClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'URL', {
      value: {
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      },
      writable: true,
    });

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/pdf/generate')) {
        return {
          ok: true,
          blob: async () => new Blob(['pdf'], { type: 'application/pdf' }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    }) as typeof fetch;
  });

  it('downloads the prompt pack as a pdf and still logs analytics', async () => {
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        Object.defineProperty(element, 'click', {
          value: vi.fn(),
          configurable: true,
        });
      }
      return element;
    }) as typeof document.createElement);

    render(
      <SessionEndClient
        sessionId="11111111-1111-1111-1111-111111111111"
        organizationName="Biz Group"
        participantId="22222222-2222-2222-2222-222222222222"
        participantName="Alex Example"
        participantEmail="alex@example.com"
        hasEmailConsent
        feedbackSubmitted
        submissions={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));

    await waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    });

    const anchor = createElementSpy.mock.results.find((result) => (result.value as HTMLElement)?.tagName === 'A')?.value as HTMLAnchorElement;
    expect(anchor.download).toBe('prompt-pack-alex-example.pdf');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/analytics/event',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(appendChildMock).toHaveBeenCalled();
    expect(removeChildMock).toHaveBeenCalled();
  });
});
