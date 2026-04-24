// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkshopRunner } from '@/components/workshop/WorkshopRunner';

const pushMock = vi.fn();
const routerMock = { push: pushMock };

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

vi.mock('next/image', () => ({
  default: (props: any) => <img {...props} alt={props.alt || ''} />,
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function mockJsonResponse(body: unknown) {
  return Promise.resolve({
    json: async () => body,
  } as Response);
}

function createProps(submissions: Array<{ id: string; step_id: string; content: string; image_url?: string | null }> = []) {
  return {
    session: {
      id: '11111111-1111-1111-1111-111111111111',
      status: 'active',
      currentStepId: null,
      timerEndAt: null,
      organization: { id: 'org-1', name: 'Biz Group', logo_url: null },
      template: { name: 'Workshop Template', description: 'Template description' },
      aiToolName: 'ChatGPT',
      aiToolUrl: 'https://chat.openai.com',
    },
    modules: [
      {
        id: 'module-1',
        title: 'Module 1',
        objective: 'Learn the fundamentals',
        order_index: 0,
        steps: [
          {
            id: 'step-1',
            title: 'First Step',
            instruction_markdown: 'Objective: Understand the task\nActions: Draft your response',
            order_index: 0,
            estimated_minutes: 5,
            is_required: false,
            prompt_blocks: [],
          },
          {
            id: 'step-2',
            title: 'Second Step',
            instruction_markdown: 'Objective: Improve your draft',
            order_index: 1,
            estimated_minutes: 5,
            is_required: false,
            prompt_blocks: [],
          },
        ],
      },
    ],
    participant: {
      id: '22222222-2222-2222-2222-222222222222',
      displayName: 'Test User',
    },
    submissions,
  };
}

afterEach(() => {
  cleanup();
});

describe('WorkshopRunner soft gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/questions') && (!init?.method || init.method === 'GET')) {
        return mockJsonResponse({ success: true, data: [] });
      }

      if (url.includes('/api/sessions/state')) {
        return mockJsonResponse({
          success: true,
          session: {
            id: '11111111-1111-1111-1111-111111111111',
            status: 'live',
            currentStepId: null,
            timerEndAt: null,
          },
        });
      }

      if (url.includes('/api/analytics/event')) {
        return mockJsonResponse({ success: true });
      }

      return mockJsonResponse({ success: true });
    }) as typeof fetch;
  });

  it('shows warning modal when moving forward without completing current step', async () => {
    render(<WorkshopRunner {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));

    expect(await screen.findByText('Move on and come back later?')).toBeTruthy();
  });

  it('keeps user on current step when choosing stay and complete', async () => {
    render(<WorkshopRunner {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
    expect(await screen.findByText('Move on and come back later?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Stay with this step' }));

    await waitFor(() => {
      expect(screen.queryByText('Move on and come back later?')).toBeNull();
    });
    expect(screen.getByRole('heading', { name: 'First Step' })).toBeTruthy();
  });

  it('advances and marks previous step as skipped when choosing skip for now', async () => {
    render(<WorkshopRunner {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
    expect(await screen.findByText('Move on and come back later?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue and return later' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Second Step' })).toBeTruthy();
    });
    expect(screen.getByText('Come back later')).toBeTruthy();
  });

  it('does not warn when current step already has a submission', async () => {
    render(
      <WorkshopRunner
        {...createProps([
          {
            id: 'sub-1',
            step_id: 'step-1',
            content: 'Submitted response',
            image_url: null,
          },
        ])}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Second Step' })).toBeTruthy();
    });
    expect(screen.queryByText('Move on and come back later?')).toBeNull();
  });

  it('renders the richer narrative step sections and wayfinding copy', async () => {
    render(<WorkshopRunner {...createProps()} />);

    expect(screen.getByText('You are here')).toBeTruthy();
    expect(screen.getByText('What To Do')).toBeTruthy();
    expect(screen.getByText('What this unlocks')).toBeTruthy();
  });
});
