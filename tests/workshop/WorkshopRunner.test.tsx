// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element, @typescript-eslint/no-explicit-any */

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

interface PromptBlockFixture {
  id: string;
  title: string;
  content_markdown: string;
  order_index: number;
  is_copyable: boolean;
}

interface StepFixture {
  id: string;
  title: string;
  instruction_markdown: string;
  order_index: number;
  estimated_minutes: number | null;
  is_required: boolean;
  show_response_field?: boolean;
  is_gallery_step?: boolean;
  prompt_blocks: PromptBlockFixture[];
}

function createProps(submissions: Array<{ id: string; step_id: string; content: string; image_url?: string | null }> = []) {
  const steps: StepFixture[] = [
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
  ];

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
        steps,
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

describe('WorkshopRunner gallery steps', () => {
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
            // The facilitator has moved to another step. Participants navigate
            // freely, so this must not move them.
            status: 'live',
            currentStepId: 'step-2',
            timerEndAt: null,
          },
        });
      }

      // A caption-only edit (auto-saved by GalleryStepSubmission's ImageTile
      // on blur) must echo back the row it just updated so WorkshopRunner's
      // onSubmitted can find and replace the right entry by id.
      if (url.endsWith('/api/submissions') && init?.method === 'POST') {
        const body = init.body ? JSON.parse(String(init.body)) : {};
        return mockJsonResponse({
          success: true,
          submission: {
            id: body.submissionId ?? 'sub-new',
            step_id: body.stepId,
            content: body.content ?? '',
            image_url: body.imageUrl ?? null,
            updated_at: new Date().toISOString(),
          },
        });
      }

      return mockJsonResponse({ success: true });
    }) as typeof fetch;
  });

  function galleryProps(
    submissions: Array<{ id: string; step_id: string; content: string; image_url?: string | null }> = []
  ) {
    const props = createProps(submissions);
    props.modules[0].steps[0] = {
      ...props.modules[0].steps[0],
      title: 'Workplace 2030',
      instruction_markdown:
        'Objective: Generate an image of the workplace of 2030\nActions: Use your AI tool',
      prompt_blocks: [
        {
          id: 'block-1',
          title: 'Starter prompt',
          content_markdown: 'A photo of a futuristic office',
          order_index: 0,
          is_copyable: true,
        },
      ],
      is_gallery_step: true,
    };
    return props;
  }

  it('strips guided content down to the image submission surface', async () => {
    render(<WorkshopRunner {...galleryProps()} />);

    expect(screen.getByText('Gallery activity')).toBeTruthy();
    expect(screen.getByText('Drop, paste or choose an image')).toBeTruthy();

    // Hidden on a gallery step: the prompt lives on the projected wall.
    expect(screen.queryByText('You are here')).toBeNull();
    expect(screen.queryByText('What To Do')).toBeNull();
    expect(screen.queryByText('Prompt Templates')).toBeNull();
    expect(screen.queryByRole('button', { name: /Open ChatGPT/ })).toBeNull();

    // Facilitation lifelines stay.
    expect(screen.getByRole('button', { name: /Ask a Question/ })).toBeTruthy();
  });

  it('shows the submitted confirmation when returning to a completed gallery step', async () => {
    render(
      <WorkshopRunner
        {...galleryProps([
          {
            id: 'sub-1',
            step_id: 'step-1',
            content: 'my futuristic office',
            image_url: 'https://example.test/img.png',
          },
        ])}
      />
    );

    // Derived from the persisted submission, not from a transient just-submitted
    // flag, so it survives navigating away and back.
    expect(screen.getByText('Submitted')).toBeTruthy();
    expect(screen.getByText('Look at the main screen 👀')).toBeTruthy();
    expect(screen.getByAltText('Your submitted image')).toBeTruthy();
    expect(screen.getByDisplayValue('my futuristic office')).toBeTruthy();
    // A step can hold more than one image now, so the zero-state prompt is
    // gone but the "add another" control stays available.
    expect(screen.queryByText('Drop, paste or choose an image')).toBeNull();
    expect(screen.getByText('Add another image')).toBeTruthy();
  });

  it('auto-saves a caption edit on an existing gallery image without touching its file', async () => {
    render(
      <WorkshopRunner
        {...galleryProps([
          {
            id: 'sub-1',
            step_id: 'step-1',
            content: 'my futuristic office',
            image_url: 'https://example.test/img.png',
          },
        ])}
      />
    );

    const caption = screen.getByDisplayValue('my futuristic office');
    fireEvent.change(caption, { target: { value: 'an even better office' } });
    fireEvent.blur(caption);

    // Persisted (echoed back by the mocked POST) and reflected in the same
    // tile -- no separate "edit" mode, no re-upload of the image.
    await waitFor(() => {
      expect(screen.getByDisplayValue('an even better office')).toBeTruthy();
    });
    expect(
      (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((call) => {
        if (!String(call[0]).endsWith('/api/submissions/upload')) return false;
        return true;
      })
    ).toBe(false);
  });

  it('leaves a guided step fully intact', async () => {
    // The whole risk of adding guards to a ~1000 line component.
    render(<WorkshopRunner {...createProps()} />);

    expect(screen.getByText('You are here')).toBeTruthy();
    expect(screen.getByText('What To Do')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open ChatGPT/ })).toBeTruthy();
    expect(screen.queryByText('Gallery activity')).toBeNull();
  });

  it('does not follow the facilitator step pointer', async () => {
    render(<WorkshopRunner {...galleryProps()} />);

    // The polled session state reports step-2 as current; the participant
    // opened on step-1 and must stay there.
    await waitFor(() => {
      expect(
        (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((call) =>
          String(call[0]).includes('/api/sessions/state')
        )
      ).toBe(true);
    });

    expect(screen.getByRole('heading', { name: 'Workplace 2030' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Second Step' })).toBeNull();
  });
});
