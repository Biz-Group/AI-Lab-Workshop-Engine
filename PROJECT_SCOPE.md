# AI Workshop Runner — Project Scope Document

**Project Name:** AI Workshop Runner  
**Version:** 2.0.0  
**Last Updated:** April 13, 2026  
**Status:** Production-Ready (Active Development)

---

## 📋 Executive Summary

AI Workshop Runner is a production-ready web platform for facilitating live, interactive AI workshops. Facilitators guide participants through structured prompt engineering exercises with real-time session control, progress tracking, Q&A, feedback collection, and automated deliverable distribution (email + PDF prompt packs). The platform supports multi-organization tenancy, an activity library for reusable content, per-step AI tool configuration, submission galleries with image uploads, and CRM-style client management.

### Core Value Proposition
- **For Facilitators**: Full real-time workshop control—navigation, timers, participant monitoring, Q&A, submission galleries, and analytics export
- **For Participants**: Frictionless code-based joining, self-paced navigation, structured prompt building, feedback, and personalized prompt pack delivery
- **For Organizations**: Lead capture, approved client lists, reusable activity libraries, and session analytics

---

## 🎯 Project Objectives

### Primary Goals
1. Enable facilitators to run engaging AI workshops with real-time control
2. Provide frictionless participant experience with code-based joining
3. Automate lead capture and post-session deliverables (email + PDF)
4. Support multi-organization deployment with data isolation
5. Provide reusable activity libraries for consistent content across templates
6. Track session analytics and export participation data

### Success Metrics
- Session completion rate > 80%
- Participant join time < 30 seconds
- Zero authentication friction for participants
- Lead capture rate > 90%

---

## 👥 User Roles & Personas

### 1. Facilitator (Authenticated User)
**Role:** Workshop leader running live sessions

**Capabilities:**
- Create and manage workshop templates with modules, steps, and prompt blocks
- Manage an organization-wide activity library of reusable modules
- Launch and control live sessions with real-time navigation
- Monitor participant progress, stuck signals, and Q&A
- View submission galleries and facilitator notes per participant
- Access post-session analytics and CSV export
- Manage approved client lists for sessions

**User Journey:**
1. Login with email + password (Supabase Auth)
2. Create/select workshop template (or build from activity library)
3. Launch session → get join code + QR code
4. Present workshop with real-time step control, timers
5. Monitor participant engagement, answer questions
6. End session → participants receive prompt packs

### 2. Participant (Anonymous User)
**Role:** Workshop attendee

**Capabilities:**
- Join session with alphanumeric code or direct URL
- Self-paced navigation through workshop steps
- Build and copy prompts with interactive blocks
- Submit text responses and image uploads per step
- Signal when stuck, ask questions via Q&A
- Submit 5-star feedback at session end
- Receive personalized prompt pack (email + PDF download)

**User Journey:**
1. Enter join code on `/join` or visit `/join/[code]`
2. Provide name, email, consent preferences
3. Navigate through steps at own pace
4. Work on prompt exercises, submit responses
5. Complete workshop and submit feedback
6. Receive personalized prompt pack

### 3. Organization Admin
**Role:** Platform administrator

**Capabilities:**
- Manage facilitator access and organization settings
- Curate activity library (reusable modules)
- Manage approved client lists
- Access organization-wide session data

---

## 🏗️ System Architecture

### Technology Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Framework** | Next.js 16 (App Router) | Server & client components, API routes |
| **Language** | TypeScript 5.5 (strict mode) | Full type safety |
| **Styling** | Tailwind CSS 3.4 | Custom brand palette, `cn()` helper |
| **UI** | Custom component library | `src/components/ui/` barrel exports |
| **Icons** | Lucide React | Consistent iconography |
| **Database** | PostgreSQL via Supabase | RLS policies, Realtime subscriptions |
| **Auth** | Dual system | Supabase Auth (facilitators) + Custom JWT (participants) |
| **Real-time** | Supabase Realtime | `postgres_changes` subscriptions |
| **Storage** | Supabase Storage | Submission images, prompt pack PDFs, org logos |
| **Email** | Resend | Prompt pack HTML delivery |
| **PDF** | @react-pdf/renderer | Server-side prompt pack PDF generation |
| **QR Codes** | qrcode.react | Join code QR display |
| **Validation** | Zod | Request body validation in API routes |
| **Hosting** | Vercel (recommended) | Edge runtime, serverless functions |
| **Testing** | Vitest + Testing Library | jsdom environment, 10 test files |
| **Notifications** | react-hot-toast | Client-side toast messages |

### Two Auth Systems

| System | For | Method | Storage | Guard |
|--------|-----|--------|---------|-------|
| **Supabase Auth** | Facilitators | Email + password login | `sb-*-auth-token` cookies | Middleware on `/admin/*`, `/session/*/presenter` |
| **Custom JWT** | Participants | HS256 via `jose` library | `workshop_session_token` httpOnly cookie | `verifySessionToken()` in API routes |

**Important:** Facilitators must have both a Supabase Auth user account AND a `facilitator_users` record linked to an organization. See [FACILITATOR_SETUP.md](FACILITATOR_SETUP.md).

### Three Supabase Clients

| Client | Import From | Used In | RLS |
|--------|-------------|---------|-----|
| Browser `createClient()` | `'@/lib/supabase'` (barrel) | Client components, Realtime | Yes |
| Server `createClient()` | `'@/lib/supabase/server'` (direct) | Server components, auth checks | Yes |
| `createServiceClient()` | `'@/lib/supabase/server'` (direct) | API route data mutations | **No** (bypasses RLS) |

**Critical:** Never import from `'@/lib/supabase/server'` in client components—it uses `next/headers`.

---

## 📐 Database Schema

### 19 Migrations (`supabase/migrations/001–019`)

| # | Name | Purpose |
|---|------|---------|
| 001 | Initial Schema | Core tables, enums, indexes, storage buckets |
| 002 | RLS Policies | Row-level security, helper functions (`is_facilitator_of_org`, etc.) |
| 003 | Storage & Realtime | Storage bucket policies, session_progress view |
| 004 | Feedback | `feedback` table (rating, text, most_valuable) |
| 005 | Session Access Fix | `service_role` full-access policies for all tables |
| 005a | Cleanup Policies | Remove conflicting policies |
| 005b | Create Policies | Rebuild clean policy set |
| 006 | Schema Constraints | Fix nullable FK columns, performance indexes |
| 007 | Session Event Fields | `client_name`, `department`, `location`, `poc_name`, `event_type`, `event_date` on sessions |
| 008 | Drop navigation_locked | Remove deprecated navigation locking column |
| 009 | Q&A System | `session_questions` table |
| 010 | Drop session_progress | Remove SECURITY DEFINER view |
| 011 | AI Tool Links | `ai_tool_name`, `ai_tool_url` on templates + sessions |
| 012 | Submission Images | `image_url` on submissions, `submission-images` bucket |
| 013 | Performance Indexes | Composite indexes for common queries |
| 014 | Step AI Tool Override | Per-step `ai_tool_name`/`ai_tool_url` overrides |
| 015 | Activity Library | `activity_library`, `activity_library_steps`, `activity_library_prompt_blocks` tables |
| 016 | Library Sync | `source_module_id` on library, backfill trigger |
| 017 | Backfill Library Steps | Copy existing steps/blocks into library tables |
| 018 | Approved Clients | `approved_clients` table, `poc_email` on sessions |
| 019 | POC Fields | `poc_name`, `poc_email` on approved_clients, sample data |

### Tables (22 total)

**Organization & Users:**
- `organizations` — name, industry, tone_notes, example_use_cases[], logo_url
- `facilitator_users` — user_id (Supabase Auth FK), organization_id, role (owner/admin/facilitator), display_name
- `approved_clients` — organization_id, name, poc_name, poc_email

**Template Authoring:**
- `workshop_templates` — name, description, estimated_duration_minutes, is_published, ai_tool_name, ai_tool_url
- `modules` — template_id, title, objective, order_index
- `module_steps` — module_id, title, instruction_markdown, order_index, estimated_minutes, is_required, ai_tool_name, ai_tool_url
- `prompt_blocks` — step_id, title, content_markdown, order_index, is_copyable

**Activity Library (reusable org-wide content):**
- `activity_library` — organization_id, title, objective, source_module_id
- `activity_library_steps` — activity_id, title, instruction_markdown, order_index, estimated_minutes, is_required, ai_tool_name, ai_tool_url
- `activity_library_prompt_blocks` — library_step_id, title, content_markdown, order_index, is_copyable

**Session Snapshots (frozen copies at session creation):**
- `sessions` — organization_id, template_id, facilitator_id, join_code, status, current_step_id, timer_end_at, scheduled_at, started_at, ended_at, client_name, department, location, poc_name, poc_email, event_type (keynote/halfday/fullday), event_date, ai_tool_name, ai_tool_url
- `session_snapshot_modules` — session_id, original_module_id, title, objective, order_index
- `session_snapshot_steps` — session_id, snapshot_module_id, original_step_id, title, instruction_markdown, instruction_markdown_raw, order_index, estimated_minutes, is_required, ai_tool_name, ai_tool_url
- `session_snapshot_prompt_blocks` — session_id, snapshot_step_id, original_block_id, title, content_markdown, content_markdown_raw, order_index, is_copyable

**Participant Data:**
- `participants` — session_id, display_name, email, email_consent, marketing_consent, joined_at, last_seen_at, current_step_id, facilitator_notes
- `submissions` — participant_id, session_id, step_id, content, image_url, created_at, updated_at (upsert per step)
- `votes` — participant_id, submission_id

**Engagement & Analytics:**
- `analytics_events` — participant_id, session_id, event_type, payload, created_at
- `feedback` — session_id, participant_id, rating (1–5), feedback, most_valuable, submitted_at
- `session_questions` — session_id, participant_id, participant_name, question_text, answer_text, is_answered, created_at, answered_at
- `leads` — email, display_name, session_id, organization_id, marketing_consent

### Storage Buckets
- `prompt-packs` — Private, 5MB PDFs, service role upload
- `submission-images` — Public, 5MB images
- `org-logos` — Public, 2MB images

### Enums
- `session_status`: draft, published, live, ended
- `user_role`: owner, admin, facilitator
- `event_type`: keynote, halfday, fullday

---

## 🔑 Key Features

### 1. Authentication & Access Control
- **Facilitator Auth:** Password-based Supabase Auth login
- **Participant Access:** Code-based joining with custom JWT (no Supabase Auth)
- **RLS Policies:** Row-level security on all 22 tables
- **Service Role Bypass:** API routes use `createServiceClient()` for data mutations
- **Middleware Protection:** Guards `/admin/*` and `/session/*/presenter` via `sb-*-auth-token` cookie detection
- **Rate Limiting:** In-memory sliding window per endpoint (join: 10/min, submissions: 20/min, analytics: 60/min, feedback: 5/min)

### 2. Template Management (Full CRUD)
- Create, read, update, delete workshop templates
- Nested module → step → prompt block hierarchy
- Per-template AI tool configuration (default: ChatGPT)
- Per-step AI tool override (e.g., different AI tool per exercise)
- Variable substitution placeholders: `{ORG_NAME}`, `{INDUSTRY}`, `{TONE_NOTES}`, `{USE_CASE_1}`–`{USE_CASE_5}`
- Full admin UI at `/admin/templates` with inline editing

### 3. Activity Library
- Organization-wide reusable module collection
- Auto-sync from template modules via `syncModuleToLibrary()`
- Deep-copy library activities into any template (`insert-into-template`)
- Save template modules back to library (`save-from-template`)
- Full admin UI at `/admin/modules`

### 4. Session Management
- **Session Creation:** Generate from template with snapshot copy of all content
- **Join Code System:** 4-character alphanumeric codes (safe charset excluding I, O, 0, 1) or two-word format
- **Status Flow:** draft → published → live → ended
- **Event Metadata:** client_name, department, location, poc_name, poc_email, event_type, event_date
- **Approved Clients:** Pre-configured client list per organization
- **QR Code:** Modal with scannable join link
- **Real-time Sync:** All state changes broadcast via Supabase Realtime

### 5. Presenter Mode (Facilitator View)
- **Step Navigation:** Previous/Next controls with module awareness
- **Timer Control:** Set and display countdown timers
- **Live Monitoring:**
  - Participant count and list
  - Per-participant progress tracking
  - Stuck signals
  - Q&A queue with answer functionality
  - Facilitator notes per participant
- **Submission Gallery:** View all participant submissions for current step
- **Session Control:** End session with participant notification

### 6. Workshop Runner (Participant View)
- **Self-Paced Navigation:** Participants freely navigate steps (no forced locking)
- **Narrative Step Sections:** Parsed instruction markdown into objective, actions, deliverable, checklist, tips, success signals, reflection, next-up sections
- **Prompt Blocks:** Interactive copyable blocks with clipboard feedback
- **Submissions:** Text content and image upload per step
- **Stuck Signal:** Request help button
- **Q&A:** Ask questions during session
- **Progress Map:** Visual narrative progress indicator with module chapters
- **Chapter Celebrations:** Module completion celebration screen
- **Waiting Room:** Displayed while session is in `published` status

### 7. Real-time Features
- **Supabase Realtime Channels:**
  - Session state (current_step, timer, status)
  - Participant joins and progress
  - Submission updates
  - Q&A updates
- **Optimistic Updates:** Immediate UI feedback
- **Auto-reconnection:** Handle network disruptions
- **Cleanup:** `supabase.removeChannel()` in `useEffect` cleanup

### 8. Lead Capture & Deliverables
- **Email Collection:** Required at session join with consent options
- **Prompt Pack Generation:**
  - Aggregates all steps, submissions, and instructions
  - HTML email template via Resend
  - PDF download via `@react-pdf/renderer` (server-side)
  - Variable substitution from organization data
- **Post-Session Delivery:** Automated email with personalized prompt pack

### 9. Feedback System
- 5-star rating with text feedback
- "Most valuable" section (optional)
- Unique per participant per session
- Integrated into session end flow

### 10. Q&A System
- Participants submit questions during live sessions
- Facilitator sees question queue in presenter view
- Mark questions as answered with response text
- Real-time updates for new questions

### 11. Analytics & Tracking
- **15 Event Types:** join_verified, join_completed, waiting_viewed, step_started, step_viewed, step_completed, step_skipped, prompt_copied, question_asked, session_end_viewed, stuck_signal, chatgpt_opened, pdf_downloaded, email_sent, feedback_submitted
- **Session Analytics:** Aggregated participation data
- **CSV Export:** `buildSessionParticipationRows()` generates export-ready data with per-participant stats
- **Performance Indexes:** Optimized queries on events, submissions, participants, sessions

### 12. Client Management
- **Approved Clients:** Per-organization client list with POC details
- **Session Linking:** Associate sessions with approved clients
- **Admin UI:** Client management via `/api/admin/clients`

---

## 📁 Application Structure

### Page Routes

```
Public:
  /                              → Home page (join code entry + facilitator login link)
  /join                          → Session join entry point
  /join/[code]                   → Pre-populated join form with session details

Participant (JWT Protected):
  /s/[sessionId]                 → Main workshop runner (WorkshopRunner)
  /s/[sessionId]/end             → Session end + feedback form (SessionEndClient)

Facilitator (Supabase Auth Protected):
  /auth/login                    → Facilitator login
  /auth/callback                 → OAuth callback handler
  /admin                         → Dashboard with stats
  /admin/templates               → Template list + management
  /admin/templates/new           → Create new template
  /admin/templates/[templateId]  → Edit template (modules/steps/blocks)
  /admin/modules                 → Activity library list
  /admin/modules/[activityId]    → Edit library activity
  /admin/organizations           → Organization management
  /admin/sessions                → Session list with filtering
  /admin/sessions/new            → Create new session
  /session/[sessionId]/presenter → Facilitator presenter mode
  /session/[sessionId]/gallery   → Submission gallery view
```

### API Routes (31 endpoints)

**Participant Routes** (Custom JWT Auth):
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/sessions/join` | Join/resume session, generate JWT |
| POST | `/api/sessions/verify` | Verify join code validity |
| POST | `/api/submissions` | Upsert text/image submission per step |
| POST | `/api/submissions/upload` | Upload submission image to storage |
| POST | `/api/analytics/event` | Track user events (rate limited: 60/min) |
| POST | `/api/feedback` | Submit session feedback (1–5 rating) |
| POST | `/api/questions` | Submit Q&A question |
| POST | `/api/pdf/generate` | Generate prompt pack PDF |
| POST | `/api/email/prompt-pack` | Email prompt pack HTML |

**Admin Routes** (Supabase Auth + Org Membership):
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/api/admin/templates` | List or create templates |
| GET/PATCH/DELETE | `/api/admin/templates/[templateId]` | Get, update, or delete template |
| POST | `/api/admin/modules` | Create module (auto-syncs to library) |
| PATCH/DELETE | `/api/admin/modules/[moduleId]` | Update or delete module |
| POST | `/api/admin/steps` | Create step |
| PATCH/DELETE | `/api/admin/steps/[stepId]` | Update or delete step |
| POST | `/api/admin/prompt-blocks` | Create prompt block |
| PATCH/DELETE | `/api/admin/prompt-blocks/[blockId]` | Update or delete prompt block |
| POST | `/api/admin/sessions` | Create session from template |
| PATCH/DELETE | `/api/admin/sessions/[sessionId]` | Update or end session |
| GET/PATCH | `/api/admin/participants/[id]/notes` | Facilitator notes per participant |
| GET/POST | `/api/admin/library` | List or create library activities |
| POST | `/api/admin/library/insert-into-template` | Copy library activity into template |
| POST | `/api/admin/library/save-from-template` | Save template module to library |
| GET/POST | `/api/admin/clients` | List or add approved clients |

All API routes return `{ success: boolean, error?: string, data?: T }` and use Zod for request body validation.

---

## 🧩 Component Architecture

### UI Components (`src/components/ui/`)
| Component | Purpose |
|-----------|---------|
| `Button` | Styled action button with variants |
| `Card` | Card container with `CardContent` |
| `Checkbox` | Form checkbox |
| `CopyButton` | Copy-to-clipboard with feedback |
| `Input` | Text input with label support |
| `Loading` | Loading spinner |
| `Modal` | Dialog overlay |
| `Progress` | Progress bar |
| `QrCodeModal` | QR code display for join URLs |
| `Timer` | Countdown timer display |

Barrel export via `src/components/ui/index.ts`.

### Workshop Components (`src/components/workshop/`)
| Component | Purpose |
|-----------|---------|
| `WorkshopRunner` | Main orchestrator: step navigation, timing, submissions, real-time sync |
| `WaitingForSession` | Waiting room while session is `published` |
| `SessionEndClient` | End screen with feedback form + prompt pack |
| `FeedbackForm` | 5-star rating + text feedback + most valuable |
| `NarrativeProgressMap` | Visual step progress indicator with modules |
| `StepNarrativeSections` | Renders parsed instruction sections |
| `ChapterCelebration` | Module completion celebration screen |

### Admin Components (`src/components/admin/`)
| Component | Purpose |
|-----------|---------|
| `AdminNav` | Sidebar navigation |
| `Breadcrumbs` | Breadcrumb trail |

### Presenter Components (`src/components/presenter/`)
| Component | Purpose |
|-----------|---------|
| `PresenterView` | Facilitator live view with all controls |
| `ParticipantList` | Participant list with per-participant progress |
| `SubmissionGallery` | Gallery view of submissions for current step |

### PDF Components (`src/components/pdf/`)
| Component | Purpose |
|-----------|---------|
| `PromptPackDocument` | React PDF document for prompt pack export |

---

## 🔧 Utility Functions

### `src/lib/utils/common.ts`
- `cn()` — Tailwind class merging (clsx + tailwind-merge)
- `formatDate()`, `formatDateTime()`, `formatDuration()` — Date/time formatting
- `getTimeRemaining()` — Calculate countdown from timestamp
- `sleep()` — Async delay

### `src/lib/utils/join-code.ts`
- `generateAlphanumericCode()` — 4-char safe charset (excludes I, O, 0, 1)
- `generateTwoWordCode()` — "adjective-noun" format
- `generateJoinCode()` / `normalizeJoinCode()` / `isValidJoinCodeFormat()` / `formatJoinCodeForDisplay()`

### `src/lib/utils/session-token.ts` (server-only)
- `createSessionToken()` / `verifySessionToken()` — HS256 JWT via jose
- `setSessionTokenCookie()` / `getSessionTokenFromCookie()` / `clearSessionTokenCookie()`
- `validateParticipantSession()` — API middleware validator

### `src/lib/utils/variables.ts`
- `buildVariableContext()` — Extract variables from organization record
- `substituteVariables()` / `extractVariables()` / `hasUnsubstitutedVariables()`
- Placeholders: `{ORG_NAME}`, `{INDUSTRY}`, `{TONE_NOTES}`, `{USE_CASE_1}`–`{USE_CASE_5}`

### `src/lib/utils/step-instructions.ts`
- `parseStepInstructions()` — Parse markdown into semantic sections (objective, actions, deliverable, checklist, tips, successSignal, reflection, nextUp)

### `src/lib/utils/session-analytics.ts`
- `buildSessionParticipationRows()` — Generate CSV export data with per-participant aggregation

### `src/lib/utils/supabase-join.ts`
- `getJoinField()` / `getJoinObject()` — Handle inconsistent Supabase join results (array vs object)

### `src/lib/utils/rate-limit.ts`
- `checkRateLimit()` — In-memory sliding window rate limiter (allowed, remaining, resetAt)

### `src/lib/utils/prompt-pack.ts`
- `mapPromptPackEntries()` / `buildPromptPackDataFromSource()` — Build structured prompt pack data

### `src/lib/utils/library-sync.ts`
- `syncModuleToLibrary()` — Deep-copy template module to activity library

### `src/lib/server/prompt-pack.ts`
- `buildPromptPackData()` — Server-side query + build for prompt pack

### `src/lib/server/render-pdf.ts`
- `renderPromptPackPdf()` — Generate PDF buffer via @react-pdf/renderer

### `src/lib/ai/` (Stub/Future)
- `aiProvider.ts` — Factory for AI providers (stub, openai)
- `types.ts` — AIProvider interface, ChatMessage, CompletionOptions
- `providers/` — Stub and OpenAI implementations (not connected in current version)

---

## 📦 Type System (`src/lib/types/database.ts`)

### Enums & Unions
- `SessionStatus` = `'draft' | 'published' | 'live' | 'ended'`
- `UserRole` = `'owner' | 'admin' | 'facilitator'`
- `EventType` = 15 types (join_verified, join_completed, waiting_viewed, step_started, step_viewed, step_completed, step_skipped, prompt_copied, question_asked, session_end_viewed, stuck_signal, chatgpt_opened, pdf_downloaded, email_sent, feedback_submitted)
- `EventCategory` = `'keynote' | 'halfday' | 'fullday'`
- `JoinCodeFormat` = `'alphanumeric' | 'two-word'`

### Entity Interfaces (all with `Insert` / `Update` variants)
Organization, FacilitatorUser, WorkshopTemplate, Module, ModuleStep, PromptBlock, Session, SessionSnapshotModule, SessionSnapshotStep, SessionSnapshotPromptBlock, Participant, Submission, AnalyticsEvent, Lead, Vote, LibraryActivity, LibraryActivityStep, LibraryActivityPromptBlock, ApprovedClient

### Composite Types
- `SessionWithDetails` — Session joined with org, template, facilitator data
- `SessionSnapshotModuleWithSteps` — Module with nested steps and prompt blocks
- `ParticipantProgress` — Participant progress aggregation
- `SessionAnalytics` — Full session analytics
- `PromptPackData` / `PromptPackEntry` — Prompt pack export structure
- `SessionParticipationExportRow` — CSV export row type
- `SessionToken` — Custom JWT payload

---

## 🔐 Security

### Implemented
- **RLS Policies:** All 22 tables with row-level security
- **Helper Functions:** `is_facilitator_of_org()`, `is_admin_of_org()`, `get_user_org_ids()`
- **Service Role Policies:** Explicit full-access for service_role (API backend)
- **Supabase Auth:** Password login for facilitators
- **Custom JWT:** HS256 tokens for participants via `jose`
- **Middleware:** Route guards on `/admin/*` and `/session/*/presenter`
- **Rate Limiting:** Per-endpoint sliding window (in-memory)
- **Zod Validation:** All API request bodies validated
- **Environment Variables:** Server-only secrets, `NEXT_PUBLIC_` prefix for client
- **httpOnly Cookies:** Session tokens stored securely
- **Storage Policies:** Bucket-level access control (private prompt-packs, public images)

---

## 🚀 Deployment Architecture

### Recommended Setup
- **Frontend/API:** Vercel (serverless functions)
- **Database:** Supabase Cloud (Production tier)
- **Email:** Resend
- **Domain:** Custom domain with SSL
- **Storage:** Supabase Storage (submission images, prompt packs, org logos)

### Environment Configuration
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
SESSION_TOKEN_SECRET=xxx (32+ chars)
RESEND_API_KEY=xxx
NEXT_PUBLIC_APP_NAME=Workshop Runner
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Supabase Edge Functions
- `cleanup-old-sessions` — Periodic cleanup of sessions ended > 72 hours ago (cascade deletes analytics → feedback → submissions → participants → snapshots). Triggered via `pg_cron` with `CRON_SECRET` verification.

---

## 🔄 Key Workflows

### 1. Create and Launch Workshop
1. Facilitator logs in via email + password
2. Creates template with modules → steps → prompt blocks (or copies from activity library)
3. Creates session from template (content snapshot-copied, variables substituted)
4. System generates unique join code, facilitator shares code + QR
5. Session set to `published` (waiting room), then `live`

### 2. Participant Joins Session
1. Participant enters join code on `/join` or visits `/join/[code]`
2. System verifies code, checks session is `published` or `live`
3. Participant provides name, email, consent preferences
4. System creates participant record + lead, generates custom JWT
5. Participant lands in waiting room (if published) or workshop (if live)

### 3. Live Workshop Execution
1. Facilitator navigates through steps in presenter view
2. Real-time updates push current_step to all participants
3. Participants work on prompts at their own pace, submit responses
4. Facilitator monitors: progress, stuck signals, Q&A, submission gallery
5. Optional: Set timers for time-boxed activities
6. Module transitions show chapter celebration screens

### 4. Session Completion
1. Facilitator ends session → status set to `ended`
2. Participants redirected to end page with feedback form
3. Participant submits 5-star rating + feedback text
4. System compiles personalized prompt pack from submissions + step content
5. Email sent via Resend with HTML prompt pack
6. PDF download available via `@react-pdf/renderer`

### 5. Activity Library Workflow
1. Facilitator creates modules inside a template
2. Modules auto-sync to organization activity library
3. Library activities can be copied into other templates
4. Enables consistent content reuse across workshops

---

## 📊 Monitoring & Analytics

### Event Types (15)
| Event | Description |
|-------|-------------|
| `join_verified` | Join code verified |
| `join_completed` | Participant fully joined |
| `waiting_viewed` | Waiting room displayed |
| `step_started` | Step first viewed |
| `step_viewed` | Step viewed |
| `step_completed` | Step marked complete |
| `step_skipped` | Step skipped |
| `prompt_copied` | Prompt block copied |
| `question_asked` | Q&A question submitted |
| `session_end_viewed` | End page viewed |
| `stuck_signal` | Participant signaled stuck |
| `chatgpt_opened` | External AI tool link clicked |
| `pdf_downloaded` | Prompt pack PDF downloaded |
| `email_sent` | Prompt pack email sent |
| `feedback_submitted` | Feedback form submitted |

### Export
- Session participation CSV via `buildSessionParticipationRows()`
- Per-participant: completed steps, events, questions, feedback, submissions

---

## 🧪 Testing

### Test Files (10)
| File | Coverage |
|------|----------|
| `tests/utils.test.ts` | Common utility functions |
| `tests/api/join-route.test.ts` | Join/resume participant logic |
| `tests/api/email-prompt-pack-route.test.ts` | Email rendering |
| `tests/api/pdf-generate-route.test.ts` | PDF generation |
| `tests/workshop/WorkshopRunner.test.tsx` | Main runner component |
| `tests/workshop/NarrativeProgressMap.test.tsx` | Progress indicator |
| `tests/workshop/prompt-pack-utils.test.ts` | Prompt pack utilities |
| `tests/workshop/session-analytics.test.ts` | Analytics aggregation |
| `tests/workshop/SessionEndClient.test.tsx` | End screen |
| `tests/workshop/step-instructions.test.ts` | Instruction parsing |

### Commands
```bash
npm run test          # Vitest (jsdom environment)
npm run test:watch    # Vitest watch mode
npm run test:ui       # Vitest UI
```

---

## 🛠️ Development Commands

```bash
npm run dev           # Start Next.js dev server
npm run build         # Production build
npm run start         # Start production server
npm run lint          # ESLint
npm run test          # Vitest
npm run test:watch    # Vitest watch mode
npm run db:migrate    # supabase db push
npm run db:seed       # npx tsx scripts/seed.ts
npm run db:cleanup    # npx tsx scripts/cleanup.ts
npm run analyze       # Bundle analysis build
```

---

## 🎨 Design System

### Brand Colors
- Primary: `brand-600` (configurable via Tailwind CSS variables)
- Success: Green, Warning: Amber, Error: Red
- Neutral: Gray scale

### Typography
- All content text: `gray-900` (near-black) for optimal contrast
- Headings: Bold, clear hierarchy
- Code/Prompts: Monospace
- WCAG AA compliant color contrast

### Layout
- Mobile-first responsive design
- Consistent spacing (Tailwind scale)
- Focus states for keyboard navigation
- Custom animations: `pulse-slow`, `bounce-subtle`

---

## 📁 Import Conventions

```typescript
// Types — always from barrel
import { Session, Participant, ApiResponse } from '@/lib/types';

// Utils — barrel (excludes session-token)
import { cn, formatDate, generateJoinCode } from '@/lib/utils';

// Session token — direct import (server-only, uses next/headers)
import { createSessionToken, verifySessionToken } from '@/lib/utils/session-token';

// Supabase — browser client via barrel, server via direct
import { createClient } from '@/lib/supabase';              // client components
import { createClient, createServiceClient } from '@/lib/supabase/server'; // server only

// UI components — barrel
import { Button, Card, Modal } from '@/components/ui';
```

---

## 📚 External Dependencies

### Critical Services
| Service | Purpose | Criticality |
|---------|---------|-------------|
| Supabase | Database, Auth, Realtime, Storage | Core infrastructure |
| Resend | Email delivery | Prompt pack distribution |
| Vercel | Hosting, serverless functions | Deployment |

### Key npm Packages
| Package | Version | Purpose |
|---------|---------|---------|
| next | ^16.1.6 | App framework |
| @supabase/ssr | ^0.5.1 | Server-side Supabase |
| @supabase/supabase-js | ^2.45.0 | Supabase client |
| jose | ^5.6.3 | JWT for participant auth |
| @react-pdf/renderer | ^3.4.4 | PDF generation |
| zod | ^3.23.8 | Request validation |
| resend | ^4.0.0 | Email API |
| qrcode.react | ^4.2.0 | QR code display |
| react-hot-toast | ^2.4.1 | Toast notifications |
| lucide-react | ^0.436.0 | Icons |
| vitest | ^4.0.18 | Testing framework |

---

## ✅ Definition of Done

For a feature to be considered complete:
- [ ] Code implemented and reviewed
- [ ] Unit tests written and passing
- [ ] Integration tested in staging
- [ ] Documentation updated
- [ ] Accessibility validated
- [ ] Performance benchmarked
- [ ] Security reviewed
- [ ] Deployed to production

---

## 🔮 Future Enhancements

### Planned
- AI-assisted prompt refinement (provider infrastructure in `src/lib/ai/` ready)
- Advanced organization branding (logo upload already supported)
- Multi-facilitator support per session
- Template marketplace / sharing
- Mobile-native optimization
- Advanced analytics dashboard
- Breakout session support

---

*This document is a living document and should be updated as the project evolves. Last reviewed: April 13, 2026*
