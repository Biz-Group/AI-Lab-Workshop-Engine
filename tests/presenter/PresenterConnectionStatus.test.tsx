// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresenterView } from '@/components/presenter/PresenterView';

type RealtimeStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'JOINING'
  | 'LEAVING';

type SubscribeCallback = (status: RealtimeStatus) => void | Promise<void>;
type PostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface MockChannel {
  on: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  track: ReturnType<typeof vi.fn>;
  subscribe: (callback?: SubscribeCallback) => MockChannel;
  emit: (status: RealtimeStatus) => Promise<void>;
  emitPostgresChange: (table: string, event: PostgresEvent, payload?: Record<string, unknown>) => Promise<void>;
}

const {
  channelsByName,
  createClientMock,
  fromMock,
  participantListRenderSpy,
  qrCodeModalRenderSpy,
} = vi.hoisted(() => {
  interface QueryBuilderResult {
    data?: unknown[];
    count?: number;
    error: null;
  }

  const channelsByName = new Map<string, MockChannel>();
  const removeChannelMock = vi.fn();
  const participantListRenderSpy = vi.fn();
  const qrCodeModalRenderSpy = vi.fn();

  const createQueryBuilder = (table: string) => {
    let selectOptions: Record<string, unknown> | undefined;

    const resolveResult = (): QueryBuilderResult => {
      if (table === 'submissions' && selectOptions?.head) {
        return { count: 0, error: null };
      }

      return { data: [], error: null };
    };

    const builder = {
      select: vi.fn((_columns: string, options?: Record<string, unknown>) => {
        selectOptions = options;
        return builder;
      }),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      then: (onFulfilled?: (value: QueryBuilderResult) => unknown) =>
        Promise.resolve(resolveResult()).then(onFulfilled),
      catch: (onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolveResult()).catch(onRejected),
      finally: (onFinally?: () => void) =>
        Promise.resolve(resolveResult()).finally(onFinally),
    };

    return builder;
  };

  const fromMock = vi.fn((table: string) => createQueryBuilder(table));
  const channelMock = vi.fn((name: string) => {
    let callback: SubscribeCallback | null = null;
    const postgresHandlers: Array<{
      event: PostgresEvent;
      table?: string;
      callback: (payload: Record<string, unknown>) => void | Promise<void>;
    }> = [];

    const channel: MockChannel = {
      on: vi.fn((eventType: string, filter: Record<string, unknown>, nextCallback: (payload: Record<string, unknown>) => void | Promise<void>) => {
        if (eventType === 'postgres_changes') {
          postgresHandlers.push({
            event: (filter.event as PostgresEvent) || '*',
            table: typeof filter.table === 'string' ? filter.table : undefined,
            callback: nextCallback,
          });
        }
        return channel;
      }),
      send: vi.fn(),
      track: vi.fn(async () => ({ error: null })),
      subscribe: (nextCallback?: SubscribeCallback) => {
        callback = nextCallback ?? null;
        return channel;
      },
      emit: async (status: RealtimeStatus) => {
        if (!callback) return;
        await callback(status);
      },
      emitPostgresChange: async (table: string, event: PostgresEvent, payload: Record<string, unknown> = {}) => {
        const effectivePayload = payload.new ? payload : { ...payload, new: {} };
        for (const handler of postgresHandlers) {
          const eventMatches = handler.event === '*' || handler.event === event;
          const tableMatches = !handler.table || handler.table === table;
          if (eventMatches && tableMatches) {
            await handler.callback(effectivePayload);
          }
        }
      },
    };
    channelsByName.set(name, channel);
    return channel;
  });
  const createClientMock = vi.fn(() => ({
    from: fromMock,
    channel: channelMock,
    removeChannel: removeChannelMock,
  }));

  return {
    channelsByName,
    createClientMock,
    fromMock,
    participantListRenderSpy,
    qrCodeModalRenderSpy,
  };
});

vi.mock('@/lib/supabase', () => ({
  createClient: createClientMock,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('next/image', () => ({
  default: () => <div data-testid="mock-next-image" />,
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/presenter/ParticipantList', () => ({
  ParticipantList: () => {
    participantListRenderSpy();
    return <div data-testid="participant-list">Participant List</div>;
  },
}));

vi.mock('@/components/ui/QrCodeModal', () => ({
  QrCodeModal: ({ isOpen }: { isOpen: boolean }) => {
    qrCodeModalRenderSpy();
    return isOpen ? <div data-testid="mock-qr-modal">QR Modal</div> : null;
  },
}));

vi.mock('@/app/admin/templates/[templateId]/TemplatePreview', () => ({
  TemplatePreview: () => <div data-testid="mock-template-preview">Template Preview</div>,
}));

const SESSION_ID = '11111111-1111-1111-1111-111111111111';

function getChannel(name: string) {
  const channel = channelsByName.get(name);
  if (!channel) {
    throw new Error(`Expected channel "${name}" to exist`);
  }
  return channel;
}

async function emitChannelStatus(name: string, status: RealtimeStatus) {
  await act(async () => {
    await getChannel(name).emit(status);
  });
}

async function emitPostgresChange(
  name: string,
  table: string,
  event: PostgresEvent,
  payload?: Record<string, unknown>
) {
  await act(async () => {
    await getChannel(name).emitPostgresChange(table, event, payload);
  });
}

function getFromQueryCount(table: string) {
  return fromMock.mock.calls.filter(([queryTable]) => queryTable === table).length;
}

function renderPresenter() {
  render(
    <PresenterView
      session={{
        id: SESSION_ID,
        joinCode: 'AB3K9Q',
        status: 'live',
        currentStepId: 'step-1',
        timerEndAt: null,
        organizationName: 'Biz Group',
        templateName: 'Prompt Lab',
      }}
      modules={[
        {
          id: 'module-1',
          title: 'Module 1',
          order_index: 0,
          steps: [
            {
              id: 'step-1',
              title: 'Step 1',
              order_index: 0,
              estimated_minutes: 5,
              is_required: false,
            },
          ],
        },
      ]}
      initialParticipantCount={0}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  channelsByName.clear();

  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, data: [] }),
  })) as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Presenter connection status badge', () => {
  it('shows Broadcasting when presenter and broadcast channels are subscribed', async () => {
    renderPresenter();

    await emitChannelStatus(`presenter:${SESSION_ID}`, 'SUBSCRIBED');
    await emitChannelStatus(`workshop-broadcast:${SESSION_ID}`, 'SUBSCRIBED');

    await waitFor(() => {
      expect(screen.getByText('Broadcasting')).toBeTruthy();
    });
  });

  it('stays Broadcasting when presence channel errors but core channels stay subscribed', async () => {
    renderPresenter();

    await emitChannelStatus(`presenter:${SESSION_ID}`, 'SUBSCRIBED');
    await emitChannelStatus(`workshop-broadcast:${SESSION_ID}`, 'SUBSCRIBED');

    await waitFor(() => {
      expect(screen.getByText('Broadcasting')).toBeTruthy();
    });

    await emitChannelStatus(`presence:${SESSION_ID}`, 'CHANNEL_ERROR');

    await waitFor(() => {
      expect(screen.getByText('Broadcasting')).toBeTruthy();
    });
  });

  it('shows Disconnected immediately when presenter channel times out', async () => {
    renderPresenter();

    await emitChannelStatus(`presenter:${SESSION_ID}`, 'SUBSCRIBED');
    await emitChannelStatus(`workshop-broadcast:${SESSION_ID}`, 'SUBSCRIBED');
    await waitFor(() => {
      expect(screen.getByText('Broadcasting')).toBeTruthy();
    });

    await emitChannelStatus(`presenter:${SESSION_ID}`, 'TIMED_OUT');

    await waitFor(() => {
      expect(screen.getByText('Disconnected')).toBeTruthy();
    });
  });

  it('shows Disconnected immediately when broadcast channel errors', async () => {
    renderPresenter();

    await emitChannelStatus(`presenter:${SESSION_ID}`, 'SUBSCRIBED');
    await emitChannelStatus(`workshop-broadcast:${SESSION_ID}`, 'SUBSCRIBED');
    await waitFor(() => {
      expect(screen.getByText('Broadcasting')).toBeTruthy();
    });

    await emitChannelStatus(`workshop-broadcast:${SESSION_ID}`, 'CHANNEL_ERROR');

    await waitFor(() => {
      expect(screen.getByText('Disconnected')).toBeTruthy();
    });
  });

  it('shows Connecting when only one core channel is connected', async () => {
    renderPresenter();

    await emitChannelStatus(`presenter:${SESSION_ID}`, 'SUBSCRIBED');

    await waitFor(() => {
      expect(screen.getByText('Connecting')).toBeTruthy();
    });
  });

  it('does not re-render ParticipantList while typing an answer draft in Q&A', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (request) => {
      const url = String(request);
      if (url.includes('/api/questions?sessionId=')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                id: 'question-1',
                participant_name: 'Alex',
                question_text: 'How should I refine this prompt?',
                answer_text: null,
                is_answered: false,
                created_at: '2026-05-18T08:00:00.000Z',
              },
            ],
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as Response;
    });

    renderPresenter();

    const answerInput = await screen.findByPlaceholderText('Type answer...');
    const renderCountBeforeTyping = participantListRenderSpy.mock.calls.length;

    await act(async () => {
      fireEvent.change(answerInput, { target: { value: 'Try adding audience and output constraints.' } });
    });

    expect((answerInput as HTMLInputElement).value).toBe('Try adding audience and output constraints.');
    expect(participantListRenderSpy).toHaveBeenCalledTimes(renderCountBeforeTyping);
  });

  it('coalesces realtime bursts into one analytics refresh per debounce window', async () => {
    renderPresenter();

    await waitFor(() => {
      expect(getFromQueryCount('participants')).toBeGreaterThan(0);
    });

    const baselineParticipantsQueries = getFromQueryCount('participants');
    vi.useFakeTimers();

    await emitPostgresChange(`presenter:${SESSION_ID}`, 'submissions', 'INSERT', { new: { event_type: 'step_completed' } });
    await emitPostgresChange(`presenter:${SESSION_ID}`, 'submissions', 'INSERT', { new: { event_type: 'step_completed' } });
    await emitPostgresChange(`presenter:${SESSION_ID}`, 'submissions', 'INSERT', { new: { event_type: 'step_completed' } });

    expect(getFromQueryCount('participants')).toBe(baselineParticipantsQueries);

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getFromQueryCount('participants')).toBe(baselineParticipantsQueries + 1);
  });

  it('lazy-loads QR modal only after opening it', async () => {
    renderPresenter();
    expect(qrCodeModalRenderSpy).toHaveBeenCalledTimes(0);

    await act(async () => {
      fireEvent.click(screen.getAllByText('Show QR Code')[0]);
    });

    await waitFor(() => {
      expect(qrCodeModalRenderSpy).toHaveBeenCalled();
      expect(screen.getByTestId('mock-qr-modal')).toBeTruthy();
    });
  });
});
