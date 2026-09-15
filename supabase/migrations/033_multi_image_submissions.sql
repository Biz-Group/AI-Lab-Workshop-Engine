-- ============================================================================
-- 033: Allow multiple images per (participant, step)
--
-- Migration 001 added a UNIQUE INDEX on submissions(participant_id, step_id)
-- so every gallery-step upload overwrote the same row. Attendees could not
-- add a second image without first destroying the first -- this drops that
-- constraint so each image becomes its own row, matching how every
-- facilitator-facing surface (ProjectionWall, SubmissionGallery,
-- useSessionSubmissions) already renders submissions as a flat per-row list
-- with no one-row-per-participant assumption.
--
-- The unique index also served as a lookup index for (participant_id,
-- step_id) -- e.g. ownership checks, the new per-step image-count cap in
-- src/app/api/submissions/route.ts -- so it is replaced with a plain index
-- rather than simply dropped.
-- ============================================================================

DROP INDEX IF EXISTS idx_submissions_unique;

CREATE INDEX IF NOT EXISTS idx_submissions_participant_step
  ON submissions(participant_id, step_id);
