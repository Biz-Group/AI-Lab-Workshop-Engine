import type { SessionParticipationExportRow } from '@/lib/types';

type ParticipantRecord = {
  id: string;
  display_name: string;
  email: string | null;
  joined_at: string;
  last_seen_at: string;
  current_step_id: string | null;
  feedback_submitted?: boolean | null;
};

type SubmissionRecord = {
  participant_id: string;
  step_id: string;
};

type AnalyticsEventRecord = {
  participant_id: string;
  event_type: string;
};

type QuestionRecord = {
  participant_id: string;
};

export interface SessionParticipationSummary {
  totalParticipants: number;
  activeParticipants: number;
  participantsWithSubmissions: number;
  totalQuestions: number;
  totalStuckSignals: number;
  promptPackDownloads: number;
  promptPackEmails: number;
}

function escapeCsv(value: string | number): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildSessionParticipationRows(args: {
  participants: ParticipantRecord[];
  submissions: SubmissionRecord[];
  analyticsEvents: AnalyticsEventRecord[];
  questions: QuestionRecord[];
  stepTitlesById: Record<string, string>;
  activeWindowMs?: number;
}): {
  rows: SessionParticipationExportRow[];
  summary: SessionParticipationSummary;
} {
  const activeWindowMs = args.activeWindowMs ?? 2 * 60 * 1000;
  const completedStepsByParticipant = new Map<string, Set<string>>();
  const eventCountsByParticipant = new Map<string, Record<string, number>>();
  const questionCountsByParticipant = new Map<string, number>();

  for (const submission of args.submissions) {
    const completed = completedStepsByParticipant.get(submission.participant_id) ?? new Set<string>();
    completed.add(submission.step_id);
    completedStepsByParticipant.set(submission.participant_id, completed);
  }

  for (const event of args.analyticsEvents) {
    const counts = eventCountsByParticipant.get(event.participant_id) ?? {};
    counts[event.event_type] = (counts[event.event_type] ?? 0) + 1;
    eventCountsByParticipant.set(event.participant_id, counts);
  }

  for (const question of args.questions) {
    questionCountsByParticipant.set(
      question.participant_id,
      (questionCountsByParticipant.get(question.participant_id) ?? 0) + 1
    );
  }

  const rows = args.participants.map((participant) => {
    const completedSteps = completedStepsByParticipant.get(participant.id) ?? new Set<string>();
    const eventCounts = eventCountsByParticipant.get(participant.id) ?? {};

    return {
      participantName: participant.display_name,
      participantEmail: participant.email ?? '',
      joinedAt: participant.joined_at,
      lastSeenAt: participant.last_seen_at,
      currentStep: participant.current_step_id
        ? (args.stepTitlesById[participant.current_step_id] ?? participant.current_step_id)
        : '',
      stepsCompleted: completedSteps.size,
      submissionsCount: completedSteps.size,
      questionsAsked: questionCountsByParticipant.get(participant.id) ?? 0,
      stuckSignals: eventCounts.stuck_signal ?? 0,
      promptCopies: eventCounts.prompt_copied ?? 0,
      sessionEndViewed: eventCounts.session_end_viewed ?? 0,
      promptPackDownloaded: eventCounts.pdf_downloaded ?? 0,
      promptPackEmailed: eventCounts.email_sent ?? 0,
      feedbackSubmitted:
        participant.feedback_submitted || (eventCounts.feedback_submitted ?? 0) > 0 ? 1 : 0,
    };
  });

  return {
    rows,
    summary: {
      totalParticipants: rows.length,
      activeParticipants: rows.filter(
        (row) => row.lastSeenAt && Date.now() - new Date(row.lastSeenAt).getTime() < activeWindowMs
      ).length,
      participantsWithSubmissions: rows.filter((row) => row.submissionsCount > 0).length,
      totalQuestions: args.questions.length,
      totalStuckSignals: args.analyticsEvents.filter((event) => event.event_type === 'stuck_signal').length,
      promptPackDownloads: args.analyticsEvents.filter((event) => event.event_type === 'pdf_downloaded').length,
      promptPackEmails: args.analyticsEvents.filter((event) => event.event_type === 'email_sent').length,
    },
  };
}

export function buildSessionParticipationCsv(rows: SessionParticipationExportRow[]): string {
  const headers = [
    'Participant',
    'Email',
    'Joined At',
    'Last Seen At',
    'Current Step',
    'Steps Completed',
    'Submissions Count',
    'Questions Asked',
    'Stuck Signals',
    'Prompt Copies',
    'Session End Viewed',
    'Prompt Pack Downloaded',
    'Prompt Pack Emailed',
    'Feedback Submitted',
  ];

  return [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) =>
      [
        row.participantName,
        row.participantEmail,
        row.joinedAt,
        row.lastSeenAt,
        row.currentStep,
        row.stepsCompleted,
        row.submissionsCount,
        row.questionsAsked,
        row.stuckSignals,
        row.promptCopies,
        row.sessionEndViewed,
        row.promptPackDownloaded,
        row.promptPackEmailed,
        row.feedbackSubmitted,
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ].join('\n');
}
