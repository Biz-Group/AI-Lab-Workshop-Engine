// @vitest-environment jsdom

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const fetchMock = vi.fn();
global.fetch = fetchMock;

import { ChapterCelebration, useChapterCelebration } from '@/components/workshop/ChapterCelebration';
import { StepNarrativeSections } from '@/components/workshop/StepNarrativeSections';
import { WaitingForSession } from '@/components/workshop/WaitingForSession';

describe('StepNarrativeSections', () => {
  it('renders nothing when instructions are empty', () => {
    const { container } = render(<StepNarrativeSections instructions={{}} />);
    expect(container.textContent).toBe('');
  });

  it('renders narrative sections and normalizes checklist items', () => {
    render(
      <StepNarrativeSections
        instructions={{
          objective: 'Understand the workflow',
          actions: 'Draft a prompt',
          checklist: '- [ ] Prompt is specific\n1. Output is testable',
          nextUp: 'Share with the group',
        }}
      />
    );

    expect(screen.getByText('Why This Matters')).toBeTruthy();
    expect(screen.getByText('Understand the workflow')).toBeTruthy();
    expect(screen.getByText('Prompt is specific')).toBeTruthy();
    expect(screen.getByText('Output is testable')).toBeTruthy();
    expect(screen.getByText('Next Up')).toBeTruthy();
  });
});

describe('WaitingForSession', () => {
  const props = {
    sessionId: 'session-1',
    participantId: 'participant-1',
    participantName: 'Ava',
    organizationName: 'Biz Group',
    workshopTitle: 'AI Workshop',
    workshopDescription: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
  });

  it('renders waiting room copy, polls session state, and logs analytics', async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({ success: true, session: { status: 'published' } }),
      })
      .mockResolvedValueOnce({ json: async () => ({ success: true }) });

    render(<WaitingForSession {...props} />);

    expect(screen.getByText('Waiting for the workshop to begin')).toBeTruthy();
    await screen.findByText('Waiting for facilitator to start');
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/state?sessionId=session-1', { cache: 'no-store' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/analytics/event',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('refreshes the router when the session becomes live', async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({ success: true, session: { status: 'live' } }),
      })
      .mockResolvedValueOnce({ json: async () => ({ success: true }) });

    render(<WaitingForSession {...props} />);

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it('shows ended message when the session has ended', async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({ success: true, session: { status: 'ended' } }),
      })
      .mockResolvedValueOnce({ json: async () => ({ success: true }) });

    render(<WaitingForSession {...props} />);

    expect(await screen.findByText('Session Ended')).toBeTruthy();
  });
});

describe('ChapterCelebration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders chapter celebration and dismisses on Escape', () => {
    const onDismiss = vi.fn();
    render(
      <ChapterCelebration
        chapterTitle="Foundations"
        chapterNumber={1}
        totalChapters={3}
        chapterObjective="a working draft"
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText('Chapter Complete!')).toBeTruthy();
    expect(screen.getByText('Chapter 1 of 3')).toBeTruthy();
    expect(screen.getByText('You now have: a working draft')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses the final chapter after the timeout', () => {
    const onDismiss = vi.fn();
    render(
      <ChapterCelebration
        chapterTitle="Launch"
        chapterNumber={3}
        totalChapters={3}
        isFinalChapter
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText('Quest Complete!')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('useChapterCelebration emits one celebration for the first newly completed module', () => {
    const { result, rerender } = renderHook(
      ({ steps }) =>
        useChapterCelebration(steps, [
          { title: 'One', objective: 'first output' },
          { title: 'Two' },
        ]),
      {
        initialProps: {
          steps: [
            { id: 's1', moduleIndex: 0, status: 'completed' },
            { id: 's2', moduleIndex: 1, status: 'current' },
          ],
        },
      }
    );

    expect(result.current.celebration?.chapterTitle).toBe('One');
    act(() => result.current.dismissCelebration());
    expect(result.current.celebration).toBeNull();

    rerender({
      steps: [
        { id: 's1', moduleIndex: 0, status: 'completed' },
        { id: 's2', moduleIndex: 1, status: 'completed' },
      ],
    });

    expect(result.current.celebration?.chapterTitle).toBe('Two');
    expect(result.current.celebration?.isFinalChapter).toBe(true);
  });
});
