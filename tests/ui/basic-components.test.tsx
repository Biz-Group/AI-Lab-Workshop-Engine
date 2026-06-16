// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils')>();
  return {
    ...actual,
    copyToClipboard: vi.fn(),
  };
});

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmModal,
  CopyButton,
  EmptyState,
  Input,
  LoadingOverlay,
  LoadingSpinner,
  Modal,
  ProgressBar,
  ProgressIndicator,
  PromptBlock,
  TextArea,
  Timer,
} from '@/components/ui';
import { copyToClipboard } from '@/lib/utils';
import toast from 'react-hot-toast';

describe('UI primitives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders button variants and disables while loading', () => {
    render(
      <Button variant="danger" size="lg" isLoading>
        Delete
      </Button>
    );

    const button = screen.getByRole('button', { name: /loading/i });
    expect(button).toBeDisabled();
    expect(button.className).toContain('bg-red-600');
    expect(button.className).toContain('px-6');
  });

  it('renders card regions with forwarded attributes', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>Details</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );

    expect(screen.getByTestId('card')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Session' })).toBeTruthy();
    expect(screen.getByText('Details')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
  });

  it('renders input and textarea labels, hints, and errors', () => {
    render(
      <>
        <Input label="Name" hint="Visible hint" />
        <TextArea label="Notes" error="Required" />
      </>
    );

    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByText('Visible hint')).toBeTruthy();
    expect(screen.getByLabelText('Notes')).toBeTruthy();
    expect(screen.getByText('Required')).toBeTruthy();
  });

  it('handles modal close interactions and body scroll lock', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Confirm">
        Content
      </Modal>
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('handles confirm modal confirmation and loading state', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete item"
        description="This cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders progress labels, clamped values, and clickable steps', () => {
    const onStepClick = vi.fn();
    render(
      <>
        <ProgressBar value={125} max={100} showLabel />
        <ProgressIndicator
          isClickable
          onStepClick={onStepClick}
          steps={[
            { id: 'one', title: 'First', status: 'completed' },
            { id: 'two', title: 'Second', status: 'current' },
          ]}
        />
      </>
    );

    expect(screen.getByText('100%')).toBeTruthy();
    fireEvent.click(screen.getByText('Second'));
    expect(onStepClick).toHaveBeenCalledWith('two');
  });

  it('renders loading and empty states', () => {
    render(
      <>
        <LoadingSpinner size="sm" />
        <LoadingOverlay message="Preparing" />
        <EmptyState title="Nothing here" description="Try again" action={<button>Refresh</button>} />
      </>
    );

    expect(screen.getAllByRole('status', { name: 'Loading' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Preparing')).toBeTruthy();
    expect(screen.getByText('Nothing here')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  });

  it('toggles checkbox through its label', () => {
    render(<Checkbox label="Agree" description="Required to continue" />);

    const checkbox = screen.getByLabelText('Agree') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(screen.getByText('Agree'));
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText('Required to continue')).toBeTruthy();
  });

  it('copies text, reports success, and resets copy state', async () => {
    vi.useFakeTimers();
    vi.mocked(copyToClipboard).mockResolvedValue(true);
    const onCopy = vi.fn();

    render(<CopyButton text="copy me" onCopy={onCopy} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    });

    expect(screen.getByRole('button', { name: /copied/i })).toBeTruthy();
    expect(copyToClipboard).toHaveBeenCalledWith('copy me');
    expect(toast.success).toHaveBeenCalledWith('Copied to clipboard!');
    expect(onCopy).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByRole('button', { name: /copy/i })).toBeTruthy();
    vi.useRealTimers();
  });

  it('reports failed copy attempts', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(false);

    render(<CopyButton text="copy me" />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    await act(async () => undefined);
    expect(toast.error).toHaveBeenCalledWith('Failed to copy');
  });

  it('toggles prompt block content and respects non-copyable blocks', () => {
    render(<PromptBlock title="Prompt" content="Use this prompt" isCopyable={false} />);

    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
    expect(screen.getByText('Use this prompt')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /prompt/i }));
    expect(screen.queryByText('Use this prompt')).toBeNull();
  });

  it('renders timer output and calls onExpire once', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const onExpire = vi.fn();

    render(<Timer endAt={new Date('2026-01-01T00:00:02Z')} onExpire={onExpire} />);
    expect(screen.getByRole('timer').textContent).toBe('00:02');

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('timer')).toBeNull();
    vi.useRealTimers();
  });
});
