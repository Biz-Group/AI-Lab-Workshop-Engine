// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PresenterQAPanel, type PresenterQuestion } from '@/components/presenter/PresenterQAPanel';

const baseQuestions: PresenterQuestion[] = [
  {
    id: 'q1',
    participant_name: 'Ava',
    question_text: 'Can we use ChatGPT?',
    answer_text: null,
    is_answered: false,
    created_at: '2026-01-01T10:00:00Z',
  },
  {
    id: 'q2',
    participant_name: 'Noor',
    question_text: 'Where is the template?',
    answer_text: 'In the shared folder',
    is_answered: true,
    created_at: '2026-01-01T10:05:00Z',
  },
];

describe('PresenterQAPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when there are no questions', () => {
    render(<PresenterQAPanel questions={[]} onAnswerQuestion={vi.fn()} onDeleteQuestion={vi.fn()} />);

    expect(screen.getByText('No questions yet')).toBeTruthy();
  });

  it('submits trimmed answer text and clears the draft on success', async () => {
    const onAnswerQuestion = vi.fn().mockResolvedValue(true);
    render(
      <PresenterQAPanel
        questions={baseQuestions}
        onAnswerQuestion={onAnswerQuestion}
        onDeleteQuestion={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Type answer...');
    fireEvent.change(input, { target: { value: '  Yes, please do.  ' } });
    fireEvent.click(input.nextElementSibling as HTMLElement);

    await waitFor(() => {
      expect(onAnswerQuestion).toHaveBeenCalledWith('q1', 'Yes, please do.');
    });
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('does not submit blank answers or clear draft on failed answer', async () => {
    const onAnswerQuestion = vi.fn().mockResolvedValue(false);
    render(
      <PresenterQAPanel
        questions={baseQuestions}
        onAnswerQuestion={onAnswerQuestion}
        onDeleteQuestion={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Type answer...');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAnswerQuestion).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Try this' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onAnswerQuestion).toHaveBeenCalledWith('q1', 'Try this');
    });
    expect((input as HTMLInputElement).value).toBe('Try this');
  });

  it('toggles answered questions and deletes questions', () => {
    const onDeleteQuestion = vi.fn().mockResolvedValue(undefined);
    render(
      <PresenterQAPanel
        questions={baseQuestions}
        onAnswerQuestion={vi.fn()}
        onDeleteQuestion={onDeleteQuestion}
      />
    );

    expect(screen.queryByText('In the shared folder')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /answered/i }));
    expect(screen.getByText(/In the shared folder/)).toBeTruthy();

    fireEvent.click(screen.getAllByTitle('Remove question')[0]);
    expect(onDeleteQuestion).toHaveBeenCalledWith('q1');
  });
});
