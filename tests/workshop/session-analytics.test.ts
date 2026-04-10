import { describe, expect, it } from 'vitest';
import {
  buildSessionParticipationCsv,
  buildSessionParticipationRows,
} from '@/lib/utils/session-analytics';

describe('session analytics utils', () => {
  it('builds participant summary rows and csv output', () => {
    const { rows, summary } = buildSessionParticipationRows({
      participants: [
        {
          id: 'participant-1',
          display_name: 'Alex',
          email: 'alex@example.com',
          joined_at: '2026-04-10T10:00:00.000Z',
          last_seen_at: new Date().toISOString(),
          current_step_id: 'step-1',
          feedback_submitted: true,
        },
      ],
      submissions: [
        { participant_id: 'participant-1', step_id: 'step-1' },
        { participant_id: 'participant-1', step_id: 'step-2' },
      ],
      analyticsEvents: [
        { participant_id: 'participant-1', event_type: 'stuck_signal' },
        { participant_id: 'participant-1', event_type: 'prompt_copied' },
        { participant_id: 'participant-1', event_type: 'pdf_downloaded' },
        { participant_id: 'participant-1', event_type: 'email_sent' },
      ],
      questions: [{ participant_id: 'participant-1' }],
      stepTitlesById: { 'step-1': 'Discovery / Persona Prompt' },
    });

    expect(summary.totalParticipants).toBe(1);
    expect(summary.totalQuestions).toBe(1);
    expect(summary.promptPackDownloads).toBe(1);
    expect(rows[0]).toMatchObject({
      participantName: 'Alex',
      currentStep: 'Discovery / Persona Prompt',
      stepsCompleted: 2,
      questionsAsked: 1,
      promptPackDownloaded: 1,
      promptPackEmailed: 1,
      feedbackSubmitted: 1,
    });

    const csv = buildSessionParticipationCsv(rows);
    expect(csv).toContain('Participant');
    expect(csv).toContain('Alex');
    expect(csv).toContain('Discovery / Persona Prompt');
  });
});
