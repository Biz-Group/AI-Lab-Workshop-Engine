-- ============================================================================
-- Migration: 030_event_type_enum_gaps
-- The event_type Postgres enum (001_initial_schema.sql) was only ever
-- extended once, in 004_feedback_table.sql ('feedback_submitted'). Since
-- then, src/app/api/analytics/event/route.ts's Zod schema and
-- src/app/api/sessions/join/route.ts grew to accept and send several more
-- event types that were never added to the database enum. The insert is
-- non-fatal (the error is caught and logged, never surfaced to the
-- participant), so this shipped silently: every one of these event types has
-- been failing with "invalid input value for enum event_type" instead of
-- being recorded, e.g. 'step_started' as seen in production logs.
--
-- Bringing the enum in line with every event_type literal actually used in
-- application code today.
-- ============================================================================

ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'join_verified';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'join_completed';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'waiting_viewed';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'step_started';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'step_skipped';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'question_asked';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'session_end_viewed';
