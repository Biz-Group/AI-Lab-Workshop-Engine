// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryStepSubmission } from '@/components/workshop/GalleryStepSubmission';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const PARTICIPANT_ID = '22222222-2222-2222-2222-222222222222';
const STEP_ID = '33333333-3333-3333-3333-333333333333';
const EXISTING_IMAGE = 'https://example.test/storage/sess/part/step.png';

function imageFile(name = 'ai-image.png') {
  // Small enough to skip the canvas downscale path, which jsdom cannot run.
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'image/png' });
}

/** jsdom has no clipboardData on ClipboardEvent, so build the payload by hand. */
function firePaste(target: Element, items: Array<{ kind: string; type: string; file?: File }>) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: items.map((item) => ({
        kind: item.kind,
        type: item.type,
        getAsFile: () => item.file ?? null,
      })),
    },
  });
  target.dispatchEvent(event);
  return event;
}

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof GalleryStepSubmission>> = {}
) {
  const onSubmitted = vi.fn();
  const result = render(
    <GalleryStepSubmission
      sessionId={SESSION_ID}
      participantId={PARTICIPANT_ID}
      stepId={STEP_ID}
      prompt="Generate an image of the workplace of 2030"
      onSubmitted={onSubmitted}
      {...overrides}
    />
  );
  return { ...result, onSubmitted };
}

function submissionCalls() {
  const fetchMock = global.fetch as unknown as { mock: { calls: unknown[][] } };
  return fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/submissions'));
}

beforeEach(() => {
  vi.clearAllMocks();

  let counter = 0;
  global.URL.createObjectURL = vi.fn(() => `blob:preview-${++counter}`);
  global.URL.revokeObjectURL = vi.fn();

  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('/api/submissions/upload')) {
      return Promise.resolve({
        json: async () => ({ success: true, imageUrl: 'https://example.test/uploaded.webp' }),
      } as Response);
    }

    return Promise.resolve({
      json: async () => ({
        success: true,
        submission: {
          id: 'sub-1',
          step_id: STEP_ID,
          content: '',
          image_url: 'https://example.test/uploaded.webp',
          updated_at: new Date().toISOString(),
        },
      }),
    } as Response);
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
});

describe('GalleryStepSubmission input paths', () => {
  it('accepts an image pasted from the clipboard', async () => {
    const { container } = renderComponent();

    firePaste(container.firstElementChild!, [
      { kind: 'file', type: 'image/png', file: imageFile() },
    ]);

    expect(await screen.findByAltText('Selected image preview')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Submit to gallery/ })).toBeTruthy();
  });

  it('ignores a text-only paste so caption typing is unaffected', async () => {
    const { container } = renderComponent();

    const event = firePaste(container.firstElementChild!, [
      { kind: 'string', type: 'text/plain' },
    ]);

    // Not consumed, and no image was picked up.
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByAltText('Selected image preview')).toBeNull();
    expect(screen.getByText('Drop, paste or choose an image')).toBeTruthy();
  });

  it('accepts a dropped image', async () => {
    renderComponent();

    const dropZone = screen.getByText('Drop, paste or choose an image').closest('label')!;
    fireEvent.drop(dropZone, { dataTransfer: { files: [imageFile()] } });

    expect(await screen.findByAltText('Selected image preview')).toBeTruthy();
  });

  it('rejects a non-image file with an inline message', async () => {
    renderComponent();

    const dropZone = screen.getByText('Drop, paste or choose an image').closest('label')!;
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText('Please choose a PNG, JPG or WebP image.')).toBeTruthy();
  });
});

describe('GalleryStepSubmission submission lifecycle', () => {
  it('creates only one submission when Submit is double-clicked', async () => {
    const { container } = renderComponent();

    firePaste(container.firstElementChild!, [
      { kind: 'file', type: 'image/png', file: imageFile() },
    ]);
    await screen.findByAltText('Selected image preview');

    const submit = screen.getByRole('button', { name: /Submit to gallery/ });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => {
      expect(submissionCalls()).toHaveLength(1);
    });
  });

  it('keeps the image and caption when submitting fails', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/submissions/upload')) {
        return Promise.resolve({
          json: async () => ({ success: false, error: 'Storage is unavailable' }),
        } as Response);
      }
      return Promise.resolve({ json: async () => ({ success: true }) } as Response);
    }) as typeof fetch;

    const { container } = renderComponent();

    firePaste(container.firstElementChild!, [
      { kind: 'file', type: 'image/png', file: imageFile() },
    ]);
    await screen.findByAltText('Selected image preview');

    fireEvent.change(screen.getByLabelText('Caption (optional)'), {
      target: { value: 'my office' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Submit to gallery/ }));

    // Regex, because the component renders a typographic apostrophe.
    expect(await screen.findByText(/We couldn.t submit your image\./)).toBeTruthy();
    expect(screen.getByText('Storage is unavailable')).toBeTruthy();

    // Nothing to re-drag or retype.
    expect(screen.getByAltText('Selected image preview')).toBeTruthy();
    expect((screen.getByLabelText('Caption (optional)') as HTMLTextAreaElement).value).toBe(
      'my office'
    );
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();
  });

  it('reports the submission upward so the runner can persist it', async () => {
    const { container, onSubmitted } = renderComponent();

    firePaste(container.firstElementChild!, [
      { kind: 'file', type: 'image/png', file: imageFile() },
    ]);
    await screen.findByAltText('Selected image preview');
    fireEvent.click(screen.getByRole('button', { name: /Submit to gallery/ }));

    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledTimes(1);
    });
    expect(onSubmitted.mock.calls[0][0]).toMatchObject({ id: 'sub-1', step_id: STEP_ID });
  });
});

describe('GalleryStepSubmission editing', () => {
  const existing = {
    id: 'sub-1',
    step_id: STEP_ID,
    content: 'my first caption',
    image_url: EXISTING_IMAGE,
    updated_at: '2026-09-01T10:00:00.000Z',
  };

  it('opens in the submitted state', () => {
    renderComponent({ existingSubmission: existing });

    expect(screen.getByText('Submitted')).toBeTruthy();
    expect(screen.getByText('Look at the main screen 👀')).toBeTruthy();
  });

  it('sends the stored image_url on a caption-only edit', async () => {
    renderComponent({ existingSubmission: existing });

    fireEvent.click(screen.getByRole('button', { name: /Edit submission/ }));

    fireEvent.change(await screen.findByLabelText('Caption (optional)'), {
      target: { value: 'a better caption' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => {
      expect(submissionCalls()).toHaveLength(1);
    });

    const body = JSON.parse(String((submissionCalls()[0][1] as RequestInit).body));
    // Sending null here would blank the image on the projected wall.
    expect(body.imageUrl).toBe(EXISTING_IMAGE);
    expect(body.content).toBe('a better caption');

    // No upload should have happened - no new file was chosen.
    const fetchMock = global.fetch as unknown as { mock: { calls: unknown[][] } };
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/submissions/upload'))
    ).toHaveLength(0);
  });

  it('uploads and swaps the url when the image is replaced', async () => {
    const { container } = renderComponent({ existingSubmission: existing });

    fireEvent.click(screen.getByRole('button', { name: /Edit submission/ }));
    await screen.findByLabelText('Caption (optional)');

    firePaste(container.firstElementChild!, [
      { kind: 'file', type: 'image/png', file: imageFile('replacement.png') },
    ]);
    // The remove control only appears once a NEW file is staged, so this is the
    // signal that the paste landed (the existing image already fills the
    // preview slot). Also flushes the raw dispatchEvent's state update.
    await screen.findByLabelText('Remove selected image');

    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => {
      expect(submissionCalls()).toHaveLength(1);
    });

    const body = JSON.parse(String((submissionCalls()[0][1] as RequestInit).body));
    expect(body.imageUrl).toBe('https://example.test/uploaded.webp');
  });

  it('restores the submitted state on cancel', async () => {
    renderComponent({ existingSubmission: existing });

    fireEvent.click(screen.getByRole('button', { name: /Edit submission/ }));
    fireEvent.change(await screen.findByLabelText('Caption (optional)'), {
      target: { value: 'discard me' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Submitted')).toBeTruthy();
    expect(submissionCalls()).toHaveLength(0);
  });
});
