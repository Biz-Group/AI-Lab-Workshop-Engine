// ============================================================================
// Database Types - Auto-generated from Supabase schema
// ============================================================================

export type SessionStatus = 'draft' | 'published' | 'live' | 'ended';
export type UserRole = 'owner' | 'admin' | 'facilitator';
export type EventType = 
  | 'join_verified'
  | 'join_completed'
  | 'waiting_viewed'
  | 'step_started'
  | 'step_viewed' 
  | 'step_completed' 
  | 'step_skipped'
  | 'prompt_copied' 
  | 'question_asked'
  | 'session_end_viewed'
  | 'stuck_signal' 
  | 'chatgpt_opened'
  | 'pdf_downloaded'
  | 'email_sent'
  | 'feedback_submitted';

// ============================================================================
// Organization Types
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  industry: string | null;
  tone_notes: string | null;
  example_use_cases: string[];
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInsert {
  name: string;
  industry?: string | null;
  tone_notes?: string | null;
  example_use_cases?: string[];
  logo_url?: string | null;
}

export interface OrganizationUpdate extends Partial<OrganizationInsert> {}

// ============================================================================
// Facilitator Types
// ============================================================================

export interface FacilitatorUser {
  id: string;
  user_id: string; // Supabase Auth user ID
  organization_id: string;
  role: UserRole;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface FacilitatorUserInsert {
  user_id: string;
  organization_id: string;
  role?: UserRole;
  display_name: string;
}

// ============================================================================
// Workshop Template Types
// ============================================================================

export interface WorkshopTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  estimated_duration_minutes: number;
  is_published: boolean;
  ai_tool_name: string;
  ai_tool_url: string;
  created_at: string;
  updated_at: string;
}

export interface WorkshopTemplateInsert {
  organization_id: string;
  name: string;
  description?: string | null;
  estimated_duration_minutes?: number;
  is_published?: boolean;
  ai_tool_name?: string;
  ai_tool_url?: string;
}

export interface WorkshopTemplateWithModules extends WorkshopTemplate {
  modules: ModuleWithSteps[];
}

// ============================================================================
// Module Types
// ============================================================================

export interface Module {
  id: string;
  template_id: string;
  title: string;
  objective: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface ModuleInsert {
  template_id: string;
  title: string;
  objective?: string | null;
  order_index: number;
}

export interface ModuleWithSteps extends Module {
  steps: ModuleStepWithBlocks[];
}

// ============================================================================
// Module Step Types
// ============================================================================

export interface ModuleStep {
  id: string;
  module_id: string;
  title: string;
  instruction_markdown: string;
  order_index: number;
  estimated_minutes: number | null;
  is_required: boolean;
  ai_tool_name: string | null;
  ai_tool_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModuleStepInsert {
  module_id: string;
  title: string;
  instruction_markdown: string;
  order_index: number;
  estimated_minutes?: number | null;
  is_required?: boolean;
  ai_tool_name?: string | null;
  ai_tool_url?: string | null;
}

export interface ModuleStepWithBlocks extends ModuleStep {
  prompt_blocks: PromptBlock[];
}

// ============================================================================
// Prompt Block Types
// ============================================================================

export interface PromptBlock {
  id: string;
  step_id: string;
  title: string;
  content_markdown: string;
  order_index: number;
  is_copyable: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromptBlockInsert {
  step_id: string;
  title: string;
  content_markdown: string;
  order_index: number;
  is_copyable?: boolean;
}

// ============================================================================
// Session Types
// ============================================================================

export type EventCategory = 'keynote' | 'halfday' | 'fullday';

export interface Session {
  id: string;
  organization_id: string;
  template_id: string;
  facilitator_id: string;
  join_code: string;
  status: SessionStatus;
  current_step_id: string | null;
  timer_end_at: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  client_name: string | null;
  department: string | null;
  location: string | null;
  poc_name: string | null;
  poc_email: string | null;
  event_type: EventCategory | null;
  event_date: string | null;
  ai_tool_name: string;
  ai_tool_url: string;
  created_at: string;
  updated_at: string;
}

export interface SessionInsert {
  organization_id: string;
  template_id: string;
  facilitator_id: string;
  join_code: string;
  status?: SessionStatus;
  scheduled_at?: string | null;
  client_name?: string | null;
  department?: string | null;
  location?: string | null;
  poc_name?: string | null;
  poc_email?: string | null;
  event_type?: EventCategory | null;
  event_date?: string | null;
  ai_tool_name?: string;
  ai_tool_url?: string;
}

export interface SessionUpdate {
  status?: SessionStatus;
  current_step_id?: string | null;
  timer_end_at?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
}

// ============================================================================
// Session Snapshot Types
// ============================================================================

export interface SessionSnapshotModule {
  id: string;
  session_id: string;
  original_module_id: string;
  title: string;
  objective: string | null;
  order_index: number;
  created_at: string;
}

export interface SessionSnapshotStep {
  id: string;
  session_id: string;
  snapshot_module_id: string;
  original_step_id: string;
  title: string;
  instruction_markdown: string;
  instruction_markdown_raw: string; // Before variable substitution
  order_index: number;
  estimated_minutes: number | null;
  is_required: boolean;
  ai_tool_name: string;
  ai_tool_url: string;
  created_at: string;
}

export interface SessionSnapshotPromptBlock {
  id: string;
  session_id: string;
  snapshot_step_id: string;
  original_block_id: string;
  title: string;
  content_markdown: string;
  content_markdown_raw: string; // Before variable substitution
  order_index: number;
  is_copyable: boolean;
  created_at: string;
}

// ============================================================================
// Participant Types
// ============================================================================

export interface Participant {
  id: string;
  session_id: string;
  display_name: string;
  email: string | null;
  email_consent: boolean;
  marketing_consent: boolean;
  joined_at: string;
  last_seen_at: string;
  current_step_id: string | null;
}

export interface ParticipantInsert {
  session_id: string;
  display_name: string;
  email?: string | null;
  email_consent?: boolean;
  marketing_consent?: boolean;
}

export interface ParticipantUpdate {
  last_seen_at?: string;
  current_step_id?: string | null;
  email?: string | null;
  email_consent?: boolean;
  marketing_consent?: boolean;
}

// ============================================================================
// Submission Types
// ============================================================================

export interface Submission {
  id: string;
  participant_id: string;
  session_id: string;
  step_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionInsert {
  participant_id: string;
  session_id: string;
  step_id: string;
  content: string;
  image_url?: string | null;
}

// ============================================================================
// Analytics Event Types
// ============================================================================

export interface AnalyticsEvent {
  id: string;
  participant_id: string;
  session_id: string;
  event_type: EventType;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface AnalyticsEventInsert {
  participant_id: string;
  session_id: string;
  event_type: EventType;
  payload?: Record<string, unknown> | null;
}

// ============================================================================
// Lead Types
// ============================================================================

export interface Lead {
  id: string;
  email: string;
  display_name: string;
  session_id: string;
  organization_id: string;
  marketing_consent: boolean;
  created_at: string;
}

export interface LeadInsert {
  email: string;
  display_name: string;
  session_id: string;
  organization_id: string;
  marketing_consent: boolean;
}

// ============================================================================
// Vote Types (Optional feature)
// ============================================================================

export interface Vote {
  id: string;
  participant_id: string;
  submission_id: string;
  created_at: string;
}

export interface VoteInsert {
  participant_id: string;
  submission_id: string;
}

// ============================================================================
// Activity Library Types
// ============================================================================

export interface LibraryActivity {
  id: string;
  organization_id: string;
  title: string;
  objective: string | null;
  source_module_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LibraryActivityInsert {
  organization_id: string;
  title: string;
  objective?: string | null;
  source_module_id?: string | null;
}

export interface LibraryActivityStep {
  id: string;
  activity_id: string;
  title: string;
  instruction_markdown: string;
  order_index: number;
  estimated_minutes: number | null;
  is_required: boolean;
  ai_tool_name: string | null;
  ai_tool_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface LibraryActivityStepInsert {
  activity_id: string;
  title: string;
  instruction_markdown?: string;
  order_index: number;
  estimated_minutes?: number | null;
  is_required?: boolean;
  ai_tool_name?: string | null;
  ai_tool_url?: string | null;
}

export interface LibraryActivityPromptBlock {
  id: string;
  library_step_id: string;
  title: string;
  content_markdown: string;
  order_index: number;
  is_copyable: boolean;
  created_at: string;
  updated_at: string;
}

export interface LibraryActivityPromptBlockInsert {
  library_step_id: string;
  title: string;
  content_markdown: string;
  order_index: number;
  is_copyable?: boolean;
}

// ============================================================================
// Approved Clients
// ============================================================================

export interface ApprovedClient {
  id: string;
  organization_id: string;
  name: string;
  poc_name: string | null;
  poc_email: string | null;
  created_at: string;
}

export interface ApprovedClientInsert {
  organization_id: string;
  name: string;
  poc_name?: string | null;
  poc_email?: string | null;
}

export interface LibraryActivityWithSteps extends LibraryActivity {
  steps: LibraryActivityStepWithBlocks[];
}

export interface LibraryActivityStepWithBlocks extends LibraryActivityStep {
  prompt_blocks: LibraryActivityPromptBlock[];
}

// ============================================================================
// Composite Types for UI
// ============================================================================

export interface SessionWithDetails extends Session {
  organization: Organization;
  snapshot_modules: SessionSnapshotModuleWithSteps[];
}

export interface SessionSnapshotModuleWithSteps extends SessionSnapshotModule {
  steps: SessionSnapshotStepWithBlocks[];
}

export interface SessionSnapshotStepWithBlocks extends SessionSnapshotStep {
  prompt_blocks: SessionSnapshotPromptBlock[];
}

export interface ParticipantProgress {
  participant_id: string;
  display_name: string;
  current_step_id: string | null;
  completed_steps: string[];
  is_stuck: boolean;
  last_seen_at: string;
}

export interface SessionAnalytics {
  session_id: string;
  total_participants: number;
  step_completions: Record<string, number>;
  step_avg_time: Record<string, number>;
  stuck_count: number;
  submissions_count: number;
}

// ============================================================================
// Session Token (for attendee authentication)
// ============================================================================

export interface SessionToken {
  participant_id: string;
  session_id: string;
  display_name: string;
  exp: number;
  iat: number;
}
