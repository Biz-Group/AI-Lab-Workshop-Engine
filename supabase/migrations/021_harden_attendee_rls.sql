-- ============================================================================
-- AI Workshop Runner - Harden attendee-facing RLS policies
-- Migration: 021_harden_attendee_rls
-- ============================================================================

-- Attendee browser access now flows through signed-session API routes that use
-- the service role. Remove broad anon policies that exposed live session data.

DROP POLICY IF EXISTS "Anon view published sessions" ON sessions;

DROP POLICY IF EXISTS "Anon view snapshot modules" ON session_snapshot_modules;
DROP POLICY IF EXISTS "Anon view snapshot steps" ON session_snapshot_steps;
DROP POLICY IF EXISTS "Anon view snapshot blocks" ON session_snapshot_prompt_blocks;

DROP POLICY IF EXISTS "Anon join session" ON participants;
DROP POLICY IF EXISTS "Anon view own participant" ON participants;
DROP POLICY IF EXISTS "Anon update own participant" ON participants;

DROP POLICY IF EXISTS "Anon create submission" ON submissions;
DROP POLICY IF EXISTS "Anon view own submissions" ON submissions;
DROP POLICY IF EXISTS "Anon update own submissions" ON submissions;

DROP POLICY IF EXISTS "Anon create vote" ON votes;
DROP POLICY IF EXISTS "Anon create event" ON analytics_events;
DROP POLICY IF EXISTS "Anon create lead" ON leads;

DROP POLICY IF EXISTS "Authenticated read session_questions" ON session_questions;
DROP POLICY IF EXISTS "Authenticated update session_questions" ON session_questions;
DROP POLICY IF EXISTS "Authenticated delete session_questions" ON session_questions;
DROP POLICY IF EXISTS "Anon read session_questions" ON session_questions;
DROP POLICY IF EXISTS "Anon insert session_questions" ON session_questions;

DROP POLICY IF EXISTS "Facilitator read org session_questions" ON session_questions;
DROP POLICY IF EXISTS "Facilitator update org session_questions" ON session_questions;
DROP POLICY IF EXISTS "Facilitator delete org session_questions" ON session_questions;

CREATE POLICY "Facilitator read org session_questions"
  ON session_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM sessions s
      INNER JOIN facilitator_users fu
        ON fu.organization_id = s.organization_id
      WHERE s.id = session_questions.session_id
        AND fu.user_id = auth.uid()
    )
  );

CREATE POLICY "Facilitator update org session_questions"
  ON session_questions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM sessions s
      INNER JOIN facilitator_users fu
        ON fu.organization_id = s.organization_id
      WHERE s.id = session_questions.session_id
        AND fu.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM sessions s
      INNER JOIN facilitator_users fu
        ON fu.organization_id = s.organization_id
      WHERE s.id = session_questions.session_id
        AND fu.user_id = auth.uid()
    )
  );

CREATE POLICY "Facilitator delete org session_questions"
  ON session_questions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM sessions s
      INNER JOIN facilitator_users fu
        ON fu.organization_id = s.organization_id
      WHERE s.id = session_questions.session_id
        AND fu.user_id = auth.uid()
    )
  );
