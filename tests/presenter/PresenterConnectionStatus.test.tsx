// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PresenterView } from '@/components/presenter/PresenterView';

type RealtimeStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'JOINING'
  | 'LEAVING';

type SubscribeCallback = (status: RealtimeStatus) => void | Promise<void>;

interface MockChannel {
  on: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  track: ReturnType<typeof vi.fn>;
  subscribe: (callback?: SubscribeCallback) => MockChannel;
  emit: (status: RealtimeStatus) => Promise<void>;
}

const {
  channelsByName,
  createClientMock,
} = vi.hoisted(() => {
  interface QueryBuilderResult {
    data?: unknown[];
    count?: number;
    error: null;
  }

  const channelsByName = new Map<string, MockChannel>();
  const removeChannelMock = vi.fn();

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
    const channel: MockChannel = {
      on: vi.fn(() => channel),
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
  ParticipantList: () => <div data-testid="participant-list">Participant List</div>,
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
});
