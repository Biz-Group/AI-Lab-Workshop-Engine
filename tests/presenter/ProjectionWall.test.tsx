// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectionWall } from '@/components/presenter/ProjectionWall';

type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'JOINING';

interface MockChannel {
  on: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  subscribe: (callback?: (status: RealtimeStatus) => void) => MockChannel;
  emitStatus: (status: RealtimeStatus) => Promise<void>;
  emitPostgres: (payload: Record<string, unknown>) => Promise<void>;
  emitBroadcast: (event: string, payload: Record<string, unknown>) => Promise<void>;
}

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const STEP_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STEP_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const { channelsByName, createClientMock, submissionRows, setSubmissionRows } = vi.hoisted(() => {
  const channelsByName = new Map<string, MockChannel>();
  const removeChannelMock = vi.fn();
  const submissionRows: { current: Array<Record<string, unknown>> } = { current: [] };

  const setSubmissionRows = (rows: Array<Record<string, unknown>>) => {
    submissionRows.current = rows;
  };

  const createQueryBuilder = (table: string) => {
    let selectOptions: Record<string, unknown> | undefined;

    const result = () => {
      if (table === 'submissions') return { data: submissionRows.current, error: null };
      if (table === 'participants' && selectOptions?.head) return { count: 4, error: null };
      if (table === 'sessions') return { data: { current_step_id: null }, error: null };
      return { data: [], error: null };
    };

    const builder: Record<string, unknown> = {
      select: vi.fn((_columns?: string, options?: Record<string, unknown>) => {
        selectOptions = options;
        return builder;
      }),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      single: vi.fn(async () => result()),
      then: (onFulfilled?: (value: unknown) => unknown) =>
        Promise.resolve(result()).then(onFulfilled),
      catch: (onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(result()).catch(onRejected),
      finally: (onFinally?: () => void) => Promise.resolve(result()).finally(onFinally),
    };

    return builder;
  };

  const channelMock = vi.fn((name: string) => {
    let statusCallback: ((status: RealtimeStatus) => void) | null = null;
    const postgresHandlers: Array<(payload: Record<string, unknown>) => void> = [];
    const broadcastHandlers = new Map<string, (message: Record<string, unknown>) => void>();

    const channel: MockChannel = {
      on: vi.fn((eventType: string, filter: Record<string, unknown>, callback: (payload: never) => void) => {
        if (eventType === 'postgres_changes') {
          postgresHandlers.push(callback as (payload: Record<string, unknown>) => void);
        } else if (eventType === 'broadcast' && typeof filter.event === 'string') {
          broadcastHandlers.set(filter.event, callback as (message: Record<string, unknown>) => void);
        }
        return channel;
      }),
      send: vi.fn(),
      subscribe: (callback?: (status: RealtimeStatus) => void) => {
        statusCallback = callback ?? null;
        return channel;
      },
      emitStatus: async (status: RealtimeStatus) => {
        statusCallback?.(status);
      },
      emitPostgres: async (payload: Record<string, unknown>) => {
        for (const handler of postgresHandlers) handler(payload);
      },
      emitBroadcast: async (event: string, payload: Record<string, unknown>) => {
        broadcastHandlers.get(event)?.({ payload });
      },
    };

    channelsByName.set(name, channel);
    return channel;
  });

  const createClientMock = vi.fn(() => ({
    from: vi.fn((table: string) => createQueryBuilder(table)),
    channel: channelMock,
    removeChannel: removeChannelMock,
  }));

  return { channelsByName, createClientMock, submissionRows, setSubmissionRows };
});

vi.mock('@/lib/supabase', () => ({ createClient: createClientMock }));

vi.mock('qrcode.react', () => ({
  QRCodeCanvas: (props: { value: string }) => <div data-testid="qr" data-value={props.value} />,
}));

function submissionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub-1',
    step_id: STEP_A,
    participant_id: 'participant-1',
    content: 'a caption',
    image_url: 'https://example.test/one.png',
    hidden_from_wall: false,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
    participant: { display_name: 'Sarah' },
    ...overrides,
  };
}

const STEPS = [
  {
    id: STEP_A,
    title: 'Workplace 2030',
    moduleTitle: 'Imagining the future',
    isGalleryStep: true,
    prompt: 'Generate an image of the workplace of 2030',
  },
  {
    id: STEP_B,
    title: 'Your ideal desk',
    moduleTitle: 'Imagining the future',
    isGalleryStep: true,
    prompt: 'Generate your ideal desk',
  },
];

function renderWall(currentStepId: string | null = STEP_A) {
  return render(
    <ProjectionWall
      session={{ id: SESSION_ID, joinCode: 'K7P2', status: 'live', currentStepId }}
      steps={STEPS}
      initialParticipantCount={4}
    />
  );
}

function galleryChannel() {
  const channel = channelsByName.get(`gallery:${SESSION_ID}`);
  if (!channel) throw new Error('gallery channel was never opened');
  return channel;
}

function broadcastChannel() {
  const channel = channelsByName.get(`workshop-broadcast:${SESSION_ID}`);
  if (!channel) throw new Error('broadcast channel was never opened');
  return channel;
}

function tiles() {
  return screen.queryAllByRole('img', { name: /Submission/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  channelsByName.clear();
  setSubmissionRows([]);

  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  global.fetch = vi.fn(() =>
    Promise.resolve({ json: async () => ({ success: true }) } as Response)
  ) as typeof fetch;
});

afterEach(() => {
  cleanup();
});

describe('ProjectionWall collection state', () => {
  it('counts submissions without revealing them', async () => {
    setSubmissionRows([submissionRow()]);
    renderWall();

    expect(await screen.findByText('Your gallery is filling up…')).toBeTruthy();
    expect(screen.getByText('submitted')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();

    // The point of reveal-on-command: nothing is on screen yet.
    expect(tiles()).toHaveLength(0);
  });

  it('counts distinct participants, not submission rows', async () => {
    setSubmissionRows([
      submissionRow({ id: 'sub-1' }),
      submissionRow({ id: 'sub-2', image_url: 'https://example.test/two.png' }),
    ]);
    renderWall();

    // Both rows belong to participant-1, so the room sees 1 of 4.
    expect(await screen.findByText('1')).toBeTruthy();
    expect(screen.queryByText('2')).toBeNull();
  });

  it('shows the activity prompt prominently while collecting', async () => {
    renderWall();

    expect(
      await screen.findByRole('heading', { name: 'Generate an image of the workplace of 2030' })
    ).toBeTruthy();
  });
});

describe('ProjectionWall reveal', () => {
  it('renders every submitted image on reveal', async () => {
    setSubmissionRows([
      submissionRow({ id: 'sub-1' }),
      submissionRow({
        id: 'sub-2',
        participant_id: 'participant-2',
        image_url: 'https://example.test/two.png',
        participant: { display_name: 'Dev' },
      }),
    ]);
    renderWall();

    await screen.findByText('Your gallery is filling up…');
    fireEvent.click(screen.getByRole('button', { name: 'Reveal responses' }));

    await waitFor(() => {
      expect(tiles()).toHaveLength(2);
    });
    expect(screen.getByRole('button', { name: 'Hide responses again' })).toBeTruthy();
  });

  it('shows a submission that arrives after reveal without a second Reveal press', async () => {
    setSubmissionRows([submissionRow({ id: 'sub-1' })]);
    renderWall();

    await screen.findByText('Your gallery is filling up…');
    fireEvent.click(screen.getByRole('button', { name: 'Reveal responses' }));
    await waitFor(() => expect(tiles()).toHaveLength(1));

    await act(async () => {
      await galleryChannel().emitPostgres({
        eventType: 'INSERT',
        new: submissionRow({
          id: 'sub-late',
          participant_id: 'participant-2',
          image_url: 'https://example.test/late.png',
        }),
      });
    });

    await waitFor(() => {
      expect(tiles()).toHaveLength(2);
    });
    // Still revealed - the facilitator was never asked to press it again.
    expect(screen.getByRole('button', { name: 'Hide responses again' })).toBeTruthy();
  });

  it('drops a tile when an update removes its image', async () => {
    setSubmissionRows([submissionRow({ id: 'sub-1' })]);
    renderWall();

    fireEvent.click(await screen.findByRole('button', { name: 'Reveal responses' }));
    await waitFor(() => expect(tiles()).toHaveLength(1));

    await act(async () => {
      await galleryChannel().emitPostgres({
        eventType: 'UPDATE',
        new: submissionRow({ id: 'sub-1', image_url: null, content: '' }),
      });
    });

    await waitFor(() => {
      expect(tiles()).toHaveLength(0);
    });
  });

  it('removes a tile on delete, which carries only the primary key', async () => {
    setSubmissionRows([submissionRow({ id: 'sub-1' })]);
    renderWall();

    fireEvent.click(await screen.findByRole('button', { name: 'Reveal responses' }));
    await waitFor(() => expect(tiles()).toHaveLength(1));

    await act(async () => {
      await galleryChannel().emitPostgres({ eventType: 'DELETE', old: { id: 'sub-1' } });
    });

    await waitFor(() => {
      expect(tiles()).toHaveLength(0);
    });
  });
});

describe('ProjectionWall moderation and display toggles', () => {
  it('never renders a submission hidden from the wall', async () => {
    setSubmissionRows([
      submissionRow({ id: 'sub-1' }),
      submissionRow({
        id: 'sub-hidden',
        participant_id: 'participant-2',
        image_url: 'https://example.test/hidden.png',
        hidden_from_wall: true,
      }),
    ]);
    renderWall();

    fireEvent.click(await screen.findByRole('button', { name: 'Reveal responses' }));

    await waitFor(() => {
      expect(tiles()).toHaveLength(1);
    });
  });

  it('hides names by default and shows captions', async () => {
    setSubmissionRows([submissionRow()]);
    renderWall();

    fireEvent.click(await screen.findByRole('button', { name: 'Reveal responses' }));
    await waitFor(() => expect(tiles()).toHaveLength(1));

    expect(screen.getByText('a caption')).toBeTruthy();
    expect(screen.queryByText('Sarah')).toBeNull();
  });

  it('reveals names only when the facilitator turns them on', async () => {
    setSubmissionRows([submissionRow()]);
    renderWall();

    fireEvent.click(await screen.findByRole('button', { name: 'Reveal responses' }));
    await waitFor(() => expect(tiles()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Toggle names' }));

    expect(await screen.findByText('Sarah')).toBeTruthy();
  });
});

describe('ProjectionWall step navigation', () => {
  it('writes current_step_id once for a burst of arrow presses', async () => {
    renderWall();
    await screen.findByText('Your gallery is filling up…');

    // A held arrow key must not fire a race of PATCHes whose last response wins.
    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });

    await waitFor(() => {
      const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
        (call) => String(call[0]).includes(`/api/admin/sessions/${SESSION_ID}`)
      );
      expect(calls).toHaveLength(1);
      expect(JSON.parse(String((calls[0][1] as RequestInit).body))).toEqual({
        current_step_id: STEP_B,
      });
    });
  });

  it('broadcasts the step change so the presenter console follows', async () => {
    renderWall();
    await screen.findByText('Your gallery is filling up…');

    fireEvent.click(screen.getByRole('button', { name: 'Next activity' }));

    await waitFor(() => {
      expect(broadcastChannel().send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'step_change',
        payload: { current_step_id: STEP_B },
      });
    });
  });

  it('follows a step change broadcast from the presenter console', async () => {
    renderWall();
    await screen.findByRole('heading', { name: 'Generate an image of the workplace of 2030' });

    await act(async () => {
      await broadcastChannel().emitBroadcast('step_change', { current_step_id: STEP_B });
    });

    expect(await screen.findByRole('heading', { name: 'Generate your ideal desk' })).toBeTruthy();
    // Following the console must not itself trigger a write back.
    const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
      (call) => String(call[0]).includes(`/api/admin/sessions/${SESSION_ID}`)
    );
    expect(calls).toHaveLength(0);
  });

  it('opens on the first gallery step when the console is on a guided step', async () => {
    renderWall('some-guided-step-id');

    expect(
      await screen.findByRole('heading', { name: 'Generate an image of the workplace of 2030' })
    ).toBeTruthy();
  });
});

describe('ProjectionWall chrome', () => {
  it('reports the connection in facilitator language', async () => {
    renderWall();

    await act(async () => {
      await galleryChannel().emitStatus('SUBSCRIBED');
    });
    expect(await screen.findByText('Live')).toBeTruthy();

    await act(async () => {
      await galleryChannel().emitStatus('CHANNEL_ERROR');
    });
    expect(await screen.findByText('Reconnecting…')).toBeTruthy();
  });

  it('keeps the join code visible and the QR behind a control', async () => {
    renderWall();

    expect(await screen.findByText('K7P2')).toBeTruthy();
    expect(screen.queryByTestId('qr')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show join QR code' }));

    expect(await screen.findByTestId('qr')).toBeTruthy();
  });

  it('surfaces step-change failures inside the wall, not in a toast', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: async () => ({ success: false, error: 'Session is not live' }),
      } as Response)
    ) as typeof fetch;

    renderWall();
    await screen.findByText('Your gallery is filling up…');

    fireEvent.click(screen.getByRole('button', { name: 'Next activity' }));

    // Toasts render outside the fullscreen subtree and would be invisible.
    expect(await screen.findByText('Session is not live')).toBeTruthy();
  });

  it('explains itself when the session has no gallery steps', async () => {
    render(
      <ProjectionWall
        session={{ id: SESSION_ID, joinCode: 'K7P2', status: 'live', currentStepId: null }}
        steps={[{ ...STEPS[0], isGalleryStep: false }]}
        initialParticipantCount={4}
      />
    );

    expect(
      await screen.findByRole('heading', { name: 'No gallery activities in this session' })
    ).toBeTruthy();
  });
});
