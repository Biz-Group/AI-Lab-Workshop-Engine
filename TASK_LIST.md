# AI Workshop Runner - Task List

**Last Updated:** May 21, 2026  
**Project Status:** Production-Ready (Active Development)

---

## ✅ Completed Tasks

### #1 — Project Foundation
- [x] Next.js 16 App Router + TypeScript strict mode
- [x] Tailwind CSS + custom brand palette
- [x] Supabase client config (browser, server, service role)
- [x] ESLint + Vitest setup
- [x] Environment variables + deployment config

### #2 — Database Schema (23 migrations)
- [x] Core tables: organizations, facilitator_users, templates, modules, steps, prompt_blocks
- [x] Session snapshot tables (frozen copies at session creation)
- [x] Participant data: participants, submissions, votes, analytics_events
- [x] Feedback table (rating, text, most_valuable)
- [x] Q&A system (session_questions)
- [x] Activity library tables (activity_library, steps, prompt_blocks)
- [x] Approved clients table
- [x] Leads table with unique constraint (organization_id, email)
- [x] RLS policies on all 22 tables + hardened attendee access (migration 021)
- [x] Storage buckets: prompt-packs, submission-images, org-logos
- [x] Performance indexes (migration 013)
- [x] Prompt pack email tracking (prompt_pack_emailed_at on participants)

### #3 — Dual Auth System
- [x] Supabase Auth for facilitators (email + password)
- [x] Custom HS256 JWT for participants (jose library)
- [x] Middleware guards on /admin/* and /session/*/presenter
- [x] httpOnly session cookies (secure in production)
- [x] Rate limiting (join: 10/min, submissions: 20/min, analytics: 60/min, feedback: 5/min)

### #4 — Template Management (Full CRUD + Editor)
- [x] Template CRUD with nested modules → steps → prompt blocks
- [x] Drag-and-drop reordering via @dnd-kit
- [x] Collapse/expand all, search/filter, duration calculator
- [x] Duplicate templates, modules, steps, prompt blocks (deep copy)
- [x] Move step between modules
- [x] Per-template and per-step AI tool configuration
- [x] Variable substitution ({ORG_NAME}, {INDUSTRY}, etc.)
- [x] Admin template editor UI at /admin/templates/[templateId]
- [x] Template preview mode

### #5 — Activity Library
- [x] Organization-wide reusable module collection
- [x] Auto-sync from template modules
- [x] Copy library activities into templates
- [x] Save template modules back to library
- [x] Admin UI at /admin/modules

### #6 — Session Management
- [x] Session creation from template with snapshot copy
- [x] Session resync (re-sync draft/published to latest template)
- [x] Join code system (4-char alphanumeric or two-word)
- [x] Status flow: draft → published → live → ended
- [x] Event metadata (client_name, department, location, poc, event_type, event_date)
- [x] Approved client linking
- [x] QR code modal
- [x] Reopen ended sessions
- [x] Facilitator preview (full-screen modal, no participant record)

### #7 — Presenter Mode
- [x] Step navigation with module awareness
- [x] Timer controls + countdown display
- [x] Live monitoring: participant list, progress, stuck signals, Q&A queue
- [x] Facilitator notes per participant
- [x] Submission gallery (images + text responses, masonry layout, search, view toggle)
- [x] Preview as attendee overlay
- [x] Session end with participant notification
- [x] Connection status indicator (Wifi/WifiOff)

### #8 — Workshop Runner (Participant View)
- [x] Self-paced navigation (no forced locking)
- [x] Narrative step sections (objective, actions, deliverable, checklist, tips, etc.)
- [x] Interactive collapsible prompt blocks with clipboard copy
- [x] Text submissions + image uploads per step
- [x] Stuck signal, Q&A, progress map
- [x] Chapter celebrations on module completion
- [x] Waiting room (published status)

### #9 — Lead Capture & Deliverables
- [x] Email collection at join with consent options
- [x] Prompt pack PDF generation (@react-pdf/renderer, server-side)
- [x] Prompt pack email via n8n webhook (on-demand, participant-initiated after feedback)
- [x] PDF download on session end page
- [x] Variable substitution from org data
- [x] prompt_pack_emailed_at tracking on participants

### #10 — Feedback System
- [x] 5-star rating + text feedback + "most valuable"
- [x] Unique per participant per session
- [x] Integrated into session end flow

### #11 — Q&A System
- [x] Participant question submission during live sessions
- [x] Facilitator queue in presenter view
- [x] Mark answered with response text
- [x] Real-time updates

### #12 — Analytics & Tracking
- [x] 15 event types tracked
- [x] CSV export via buildSessionParticipationRows()
- [x] Performance indexes on events, submissions, participants

### #13 — Client Management
- [x] Approved clients per organization with POC details
- [x] Session linking to approved clients
- [x] Admin CRUD at /api/admin/clients

### #14 — Real-time Features
- [x] Supabase Realtime channels (session state, participants, submissions, Q&A)
- [x] Optimistic updates + auto-reconnection
- [x] Proper cleanup (removeChannel in useEffect)

### #15 — UI Component Library
- [x] Button, Card, Input, TextArea, Checkbox, Modal, ConfirmModal
- [x] CopyButton, PromptBlock (collapsible + copy)
- [x] LoadingSpinner, LoadingOverlay, LoadingCard, EmptyState
- [x] ProgressIndicator, ProgressBar, Timer, Countdown
- [x] QrCodeModal
- [x] Barrel export via components/ui/index.ts

### #16 — Testing Suite (10 test files)
- [x] utils.test.ts — common utilities
- [x] join-route.test.ts — join/resume participant logic
- [x] email-prompt-pack-route.test.ts — email rendering
- [x] pdf-generate-route.test.ts — PDF generation
- [x] PresenterConnectionStatus.test.tsx — presenter connection
- [x] WorkshopRunner.test.tsx — main runner component
- [x] NarrativeProgressMap.test.tsx — progress indicator
- [x] prompt-pack-utils.test.ts — prompt pack utilities
- [x] session-analytics.test.ts — analytics aggregation
- [x] SessionEndClient.test.tsx — end screen
- [x] step-instructions.test.ts — instruction parsing

### #17 — n8n Webhook Integration
- [x] sendPromptPackViaWebhook() in src/lib/server/n8n.ts
- [x] On-demand email delivery via /api/email/prompt-pack
- [x] Removed 90-minute auto-polling system (prompt-pack-due + prompt-pack-sent webhooks deleted)
- [x] Prompt pack only sent when participant explicitly requests after feedback

### #18 — Participant Resume by Email
- [x] Join route now has 3-step resume: cookie → email match → create new
- [x] Prevents duplicate participant records when same email rejoins a session

### #19 — Submission Gallery Enhancement
- [x] Extended SubmissionGallery to show both images and text responses
- [x] Masonry layout with CSS columns
- [x] View toggle (All / Images / Responses)
- [x] Search and expand/collapse functionality

### #20 — Team Management & Access Approval
- [x] access_requests table with RLS policies (migration 023)
- [x] is_owner_of_org() helper function
- [x] /api/admin/team route (GET, POST approve, PATCH role, DELETE remove)
- [x] /api/admin/team/deny route (POST deny request)
- [x] /api/auth/request-access route (GET orgs, POST submit request)
- [x] /admin/team page (server component, owner-only guard)
- [x] TeamManager client component (approve/deny requests, role management, remove members)
- [x] AccessRequestForm client component (replaces dead-end Access Denied block)
- [x] AdminNav dropdown "Team Management" link (owner-only)
- [x] Self-registration approval flow (no email invitations)
- [x] Full role management (owner/admin/facilitator) with safeguards (can't demote/remove self)

---

## 📋 Open Tasks

### #21 — Error Handling & Edge Cases
**Priority:** MEDIUM
- [ ] Graceful handling of expired/invalid join codes
- [ ] Session token expiration UX
- [ ] Real-time reconnection improvements
- [ ] Network error user feedback

### #22 — Mobile Optimization
**Priority:** MEDIUM
- [ ] Workshop runner mobile layout polish
- [ ] Presenter mode tablet view
- [ ] Touch interaction improvements
- [ ] Mobile keyboard overlap fix

### #23 — Accessibility
**Priority:** MEDIUM
- [ ] Keyboard navigation testing
- [ ] Screen reader compatibility
- [ ] ARIA labels on interactive elements
- [ ] Focus management in modals
- [ ] Color contrast validation

### #24 — Performance Optimization
**Priority:** LOW
- [ ] React.memo for heavy components
- [ ] Lazy load non-critical components
- [ ] Bundle size analysis
- [ ] Image optimization

### #25 — Documentation
**Priority:** LOW
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Facilitator user guide
- [ ] Deployment guide (Vercel)

---

## 🐛 Known Issues

1. ~~**Facilitator login not working**~~ ✅ FIXED — middleware cookie detection
2. ~~**Attendee join broken after private session_progress**~~ ✅ FIXED — migration 005
3. ~~**Duplicate participants on same-email rejoin**~~ ✅ FIXED — email-based resume (#18)
4. **Real-time disconnect handling** — participants don't always reconnect after network drop (workaround: refresh)
5. **Timer sync drift** — client-side timer can drift from server time
6. **Mobile keyboard overlaps input** — on some mobile browsers

---

## 🔮 Future Feature Ideas
- AI-powered prompt suggestions (provider infrastructure in src/lib/ai/ ready)
- Multi-facilitator support per session
- Template marketplace / sharing
- Breakout session support
- Certificate generation
- Advanced analytics dashboard
- [ ] Webhook notifications
- [ ] Advanced analytics (ML insights)
- [ ] A/B testing for templates

---

## 📅 Sprint Planning

### Current Sprint (Sprint 5)
**Dates:** Feb 8-21, 2026  
**Focus:** Testing & Refinement

**Sprint Goals:**
- [ ] Complete utility test coverage
- [ ] Fix known high-priority bugs
- [ ] Polish email template
- [ ] Mobile responsive testing

### Next Sprint (Sprint 6)
**Dates:** Feb 22 - Mar 7, 2026  
**Focus:** Admin Features & PDF

**Planned:**
- [ ] Template management UI
- [ ] PDF generation
- [ ] Session history page
- [ ] Error handling improvements

### Future Sprints
**Sprint 7:** Performance & Accessibility
**Sprint 8:** Advanced Analytics
**Sprint 9:** Polish & Launch Prep

---

## 🎯 Milestones
 (Latest Update)
- **MAJOR:** Implemented feedback requirement for prompt pack delivery
- **NEW:** Created feedback form component with 5-star rating
- **NEW:** Added POST /api/feedback endpoint
- **NEW:** Created database migration 004_feedback_table.sql
- **MODIFIED:** Attendee join page - email now mandatory
- **REMOVED:** Checkboxes for email consent and marketing from join flow
- **MODIFIED:** SessionEndClient - feedback required before prompt pack
- **MODIFIED:** Email API - checks for feedback submission
- **ADDED:** feedback_submitted event type to analytics
- Overall completion: 64.3% (up from 58.6%)

### February 10, 2026 (Morning)
- [x] **M1: Project Setup** - Completed Dec 2025
- [x] **M2: Core Schema & Auth** - Completed Jan 2026
- [x] **M3: Presenter Mode** - Completed Jan 2026
- [x] **M4: Participant Experience** - Completed Feb 2026
- [ ] **M5: Admin Portal** - Target: Feb 2026
- [ ] **M6: MVP Launch** - Target: Mar 2026
- [ ] **M7: V1.0 Release** - Target: Apr 2026

---

## 🔄 Change Log

### February 10, 2026 (Late Night Update - Final)
- **FIXED:** Service role client using wrong authentication method
- **IMPROVED:** Text readability - all input/content text now black (gray-900)
- **FIXED:** Participant navigation no longer resets or gets locked
- **IMPROVED:** Facilitator login - no auto-redirect, proper session state
- **NEW:** Admin pages - Templates, Sessions, Modules, Organizations
- **FIXED:** Admin navigation - all links now functional
- **REMOVED:** Navigation locking for participants (free navigation)
- **IMPROVED:** Markdown content styling with proper dark text
- **IMPROVED:** Input/TextArea labels now black for better readability
- **IMPROVED:** PromptBlock text contrast (gray-900)
- Overall completion: 70.0% (up from 68.6%)

### February 10, 2026 (Late Evening Update)
- **FIXED:** Attendee join broken after session_progress made private
- **NEW:** Migration 005_fix_session_access.sql
- **ADDED:** Explicit service_role policies for all tables
- **ADDED:** View permissions for session_progress
- **DOCS:** Updated README with migration 005

### February 10, 2026 (Evening Update)
- **FIXED:** Facilitator login flow - updated middleware cookie detection
- **FIXED:** Auth session handling - proper cookie persistence
- **IMPROVED:** Login page error handling and user feedback
- **NEW:** FACILITATOR_SETUP.md - comprehensive setup guide
- **DOCS:** SQL scripts for creating test facilitator accounts
- Overall completion: 68.6% (up from 64.3%)

### February 10, 2026 (Afternoon Update)
- **MAJOR:** Implemented feedback requirement for prompt pack delivery
- **NEW:** Created feedback form component with 5-star rating
- **NEW:** Added POST /api/feedback endpoint
- **NEW:** Created database migration 004_feedback_table.sql
- **MODIFIED:** Attendee join page - email now mandatory
- **REMOVED:** Checkboxes for email consent and marketing from join flow
- **MODIFIED:** SessionEndClient - feedback required before prompt pack
- **MODIFIED:** Email API - checks for feedback submission
- **ADDED:** feedback_submitted event type to analytics
- Overall completion: 64.3% (up from 58.6%)

### February 10, 2026 (Morning)
- Created comprehensive task list document
- Organized tasks by priority and category
- Documented all completed features
- Identified critical bugs and gaps

### February 8, 2026
- Completed session end page
- Implemented email prompt pack delivery
- Added session clean-up edge function stub

### January 30, 2026
- Completed presenter mode
- Added real-time synchronization
- Implemented navigation lock

### January 15, 2026
- Completed workshop runner participant view
- Added analytics event tracking
- Implemented prompt block copy functionality

---

## 📝 Notes

### Development Standards
- All PRs require review
- Tests must pass before merge
- Follow TypeScript strict mode
- Use conventional commits
- Update docs with code changes

### Deployment Checklist
- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] RLS policies verified
- [ ] Performance benchmarked
- [ ] Security audit passed
- [ ] User testing completed
- [ ] Rollback plan documented

### Team Contacts
- **Database Issues:** [DBA Name]
- **UI/UX Questions:** [Designer Name]
- **Supabase Support:** support@supabase.com
- **Resend Support:** support@resend.com

---

**Task Status Legend:**
- ✅ **Completed** - Fully done, tested, deployed
- 🔄 **In Progress** - Currently being worked on
- 📋 **To Do** - Not started, planned
- 🐛 **Bug** - Known issue to fix
- 💡 **Idea** - Future enhancement

---