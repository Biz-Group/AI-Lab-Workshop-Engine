// Re-export all types
export * from './database';

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// Form Types
// ============================================================================

export interface JoinSessionForm {
  joinCode: string;
}

export interface AttendeeRegistrationForm {
  displayName: string;
  email?: string;
  emailConsent: boolean;
  marketingConsent: boolean;
}

export interface OrganizationForm {
  name: string;
  industry?: string;
  toneNotes?: string;
  exampleUseCases: string[];
}

export interface TemplateForm {
  name: string;
  description?: string;
  estimatedDurationMinutes: number;
}

export interface ModuleForm {
  title: string;
  objective?: string;
}

export interface StepForm {
  title: string;
  instructionMarkdown: string;
  estimatedMinutes?: number;
  isRequired: boolean;
}

export interface PromptBlockForm {
  title: string;
  contentMarkdown: string;
  isCopyable: boolean;
}

// ============================================================================
// Presenter Mode Types
// ============================================================================

export interface PresenterState {
  sessionId: string;
  status: 'draft' | 'published' | 'live' | 'ended';
  currentStepId: string | null;
  timerEndAt: string | null;
  joinCode: string;
  participantCount: number;
  currentStepProgress: number; // percentage
  stuckCount: number;
}

export interface PresenterAction {
  type: 'next_step' | 'prev_step' | 'go_to_step' | 'start_timer' | 'stop_timer' | 'start_session' | 'end_session';
  payload?: {
    stepId?: string;
    timerMinutes?: number;
  };
}

// ============================================================================
// Real-time Types
// ============================================================================

export interface RealtimeSessionUpdate {
  session_id: string;
  current_step_id: string | null;
  timer_end_at: string | null;
  status: 'draft' | 'published' | 'live' | 'ended';
}

export interface RealtimeParticipantUpdate {
  participant_id: string;
  current_step_id: string | null;
  is_stuck: boolean;
}

// ============================================================================
// PDF Types
// ============================================================================

export interface PromptPackData {
  participantName: string;
  sessionDate: string;
  organizationName: string;
  workshopName: string;
  entries: PromptPackEntry[];
  takeaways: string[];
}

export interface PromptPackEntry {
  stepTitle: string;
  moduleTitle: string;
  moduleObjective: string | null;
  stepInstructions: PromptPackStepInstructions;
  promptBlocks: PromptPackPromptBlock[];
  participantResponse: PromptPackParticipantResponse | null;
}

export interface PromptPackStepInstructions {
  objective?: string;
  actions?: string;
  deliverable?: string;
  checklist?: string;
  tips?: string;
  successSignal?: string;
  reflection?: string;
  nextUp?: string;
  rawInstructions?: string;
}

export interface PromptPackPromptBlock {
  title: string;
  content: string;
  isCopyable: boolean;
}

export interface PromptPackParticipantResponse {
  content: string;
  imageUrl: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
}

// ============================================================================
// Email Types
// ============================================================================

export interface SendPromptPackEmailParams {
  to: string;
  participantName: string;
  downloadUrl: string;
  organizationName: string;
}

export interface SessionParticipationExportRow {
  participantName: string;
  participantEmail: string;
  joinedAt: string;
  lastSeenAt: string;
  currentStep: string;
  stepsCompleted: number;
  submissionsCount: number;
  questionsAsked: number;
  stuckSignals: number;
  promptCopies: number;
  sessionEndViewed: number;
  promptPackDownloaded: number;
  promptPackEmailed: number;
  feedbackSubmitted: number;
}
