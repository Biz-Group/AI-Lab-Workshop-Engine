// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GalleryStepSubmission,
  type GalleryStepSubmissionValue,
} from '@/components/workshop/GalleryStepSubmission';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const PARTICIPANT_ID = '22222222-2222-2222-2222-222222222222';
const STEP_ID = '33333333-3333-3333-3333-333333333333';

function imageFile(name = 'ai-image.png') {
  // Small enough to skip the canvas downscale path, which jsdom cannot run.
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'image/png' });
}

function existingImage(overrides: Partial<GalleryStepSubmissionValue> = {}): GalleryStepSubmissionValue {
  return {
    id: 'sub-existing',
    step_id: STEP_ID,
    content: '',
    image_url: 'https://example.test/storage/sess/part/step/existing.png',
    updated_at: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
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
  const onDeleted = vi.fn();
  const { existingSubmissions = [], ...rest } = overrides;
  const result = render(
    <GalleryStepSubmission
      sessionId={SESSION_ID}
      participantId={PARTICIPANT_ID}
      stepId={STEP_ID}
      prompt="Generate an image of the workplace of 2030"
      existingSubmissions={existingSubmissions}
      onSubmitted={onSubmitted}
      onDeleted={onDeleted}
      {...rest}
    />
  );
  return { ...result, onSubmitted, onDeleted };
}

function fetchMockCalls() {
  return (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
}

function callsTo(pathSuffix: string, method?: string) {
  return fetchMockCalls().filter((call) => {
    const matchesUrl = String(call[0]).includes(pathSuffix);
    const init = call[1] as RequestInit | undefined;
    const matchesMethod = !method || (init?.method ?? 'GET') === method;
    return matchesUrl && matchesMethod;
  });
}

/** A well-behaved default mock: upload succeeds, save succeeds, delete succeeds. */
function installDefaultFetchMock() {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.includes('/api/submissions/upload')) {
      return Promise.resolve({
        json: async () => ({ success: true, imageUrl: 'https://example.test/uploaded.webp' }),
      } as Response);
    }

    if (method === 'DELETE') {
      return Promise.resolve({ json: async () => ({ success: true }) } as Response);
    }

    // POST /api/submissions (new image or caption edit)
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return Promise.resolve({
      json: async () => ({
        success: true,
        submission: {
          id: body.submissionId ?? 'sub-new',
          step_id: STEP_ID,
          content: body.content ?? '',
          image_url: body.imageUrl ?? 'https://example.test/uploaded.webp',
          updated_at: new Date().toISOString(),
        },
      }),
    } as Response);
  }) as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();

  let counter = 0;
  global.URL.createObjectURL = vi.fn(() => `blob:preview-${++counter}`);
  global.URL.revokeObjectURL = vi.fn();

  installDefaultFetchMock();
});

afterEach(() => {
  cleanup();
});

describe('GalleryStepSubmission input paths', () => {
  it('accepts a pasted image, uploads it, and reports it to the parent', async () => {
    const { container, onSubmitted } = renderComponent();

    firePaste(container.firstElementChild!, [
      { kind: 'file', type: 'image/png', file: imageFile() },
    ]);

    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledTimes(1);
    });
    expect(onSubmitted.mock.calls[0][0]).toMatchObject({ step_id: STEP_ID });
    expect(callsTo('/api/submissions/upload')).toHaveLength(1);

    // The in-flight placeholder tile clears once the upload settles.
    expect(screen.queryByText(/Uploading|Almost there/)).toBeNull();
  });

  it('ignores a text-only paste so it never triggers an upload', async () => {
    const { container, onSubmitted } = renderComponent();

    const event = firePaste(container.firstElementChild!, [
      { kind: 'string', type: 'text/plain' },
    ]);

    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByText('Drop, paste or choose an image')).toBeTruthy();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('accepts a dropped image', async () => {
    const { onSubmitted } = renderComponent();

    const dropZone = screen.getByText('Drop, paste or choose an image').closest('label')!;
    fireEvent.drop(dropZone, { dataTransfer: { files: [imageFile()] } });

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
  });

  it('accepts several dropped images and uploads each independently', async () => {
    const { onSubmitted } = renderComponent();

    const dropZone = screen.getByText('Drop, paste or choose an image').closest('label')!;
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [imageFile('one.png'), imageFile('two.png')] },
    });

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(2));
    expect(callsTo('/api/submissions/upload')).toHaveLength(2);
  });

  it('rejects a non-image file with an inline message', async () => {
    renderComponent();

    const dropZone = screen.getByText('Drop, paste or choose an image').closest('label')!;
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [new File(['x'], 'notes.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText('Please choose a PNG, JPG or WebP image.')).toBeTruthy();
  });

  it('stops accepting new images once the per-step limit is reached', () => {
    const sixImages = Array.from({ length: 6 }, (_, i) => existingImage({ id: `sub-${i}` }));
    renderComponent({ existingSubmissions: sixImages });

    expect(screen.getByText(/maximum of 6 images/)).toBeTruthy();
    expect(screen.queryByText('Add another image')).toBeNull();
    expect(screen.queryByText('Drop, paste or choose an image')).toBeNull();
  });
});

describe('GalleryStepSubmission upload failure handling', () => {
  it('shows an inline error with retry/remove when an upload fails', async () => {
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

    expect(await screen.findByText('Storage is unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Remove/ })).toBeTruthy();
  });

  it('retries the same file when Retry is clicked', async () => {
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
    await screen.findByText('Storage is unavailable');

    const uploadCallsBefore = callsTo('/api/submissions/upload').length;
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));

    await waitFor(() => {
      expect(callsTo('/api/submissions/upload').length).toBeGreaterThan(uploadCallsBefore);
    });
  });

  it('removes the failed tile when Remove is clicked', async () => {
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
    await screen.findByText('Storage is unavailable');

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));

    await waitFor(() => {
      expect(screen.queryByText('Storage is unavailable')).toBeNull();
    });
    // Back to the empty dropzone -- nothing left staged.
    expect(screen.getByText('Drop, paste or choose an image')).toBeTruthy();
  });
});

describe('GalleryStepSubmission existing images', () => {
  it('renders one tile per existing image, each with its own caption', () => {
    renderComponent({
      existingSubmissions: [
        existingImage({ id: 'sub-a', content: 'caption A' }),
        existingImage({ id: 'sub-b', content: 'caption B' }),
      ],
    });

    expect(screen.getAllByAltText('Your submitted image')).toHaveLength(2);
    expect(screen.getByDisplayValue('caption A')).toBeTruthy();
    expect(screen.getByDisplayValue('caption B')).toBeTruthy();
    // A second, independent add control is still offered (well under the cap).
    expect(screen.getByText('Add another image')).toBeTruthy();
  });

  it('auto-saves a caption edit on blur', async () => {
    const { onSubmitted } = renderComponent({
      existingSubmissions: [existingImage({ id: 'sub-a', content: 'old caption' })],
    });

    const input = screen.getByDisplayValue('old caption');
    fireEvent.change(input, { target: { value: 'new caption' } });
    fireEvent.blur(input);

    await waitFor(() => expect(callsTo('/api/submissions', 'POST')).toHaveLength(1));

    const body = JSON.parse(String((callsTo('/api/submissions', 'POST')[0][1] as RequestInit).body));
    expect(body.submissionId).toBe('sub-a');
    expect(body.content).toBe('new caption');
    // A caption-only edit must never re-send an imageUrl -- doing so would
    // route through the "brand new image" path on the server.
    expect(body.imageUrl).toBeUndefined();
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  it('does not save when the caption is blurred unchanged', async () => {
    renderComponent({
      existingSubmissions: [existingImage({ id: 'sub-a', content: 'same caption' })],
    });

    const input = screen.getByDisplayValue('same caption');
    fireEvent.blur(input);

    // Give any accidental async save a chance to land before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callsTo('/api/submissions', 'POST')).toHaveLength(0);
  });

  it('deletes an image and reports it upward', async () => {
    const { onDeleted } = renderComponent({
      existingSubmissions: [existingImage({ id: 'sub-a' })],
    });

    fireEvent.click(screen.getByLabelText('Delete image'));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('sub-a'));
    expect(callsTo(`/api/submissions/sub-a`, 'DELETE')).toHaveLength(1);
  });

  it('shows an inline error and keeps the tile when delete fails', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'DELETE') {
        return Promise.resolve({
          json: async () => ({ success: false, error: 'Could not delete this image.' }),
        } as Response);
      }
      return Promise.resolve({ json: async () => ({ success: true }) } as Response);
    }) as typeof fetch;

    const { onDeleted } = renderComponent({
      existingSubmissions: [existingImage({ id: 'sub-a' })],
    });

    fireEvent.click(screen.getByLabelText('Delete image'));

    expect(await screen.findByText('Could not delete this image.')).toBeTruthy();
    expect(onDeleted).not.toHaveBeenCalled();
    // The tile itself is still there -- deletion failed, nothing to hide.
    expect(screen.getByAltText('Your submitted image')).toBeTruthy();
  });
});
