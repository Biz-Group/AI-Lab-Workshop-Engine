-- ============================================================================
-- Migration: 028_gallery_steps
-- Adds "gallery step" support: a step whose participant responses are projected
-- on a shared big screen (Mentimeter-style). Participants submit an image plus
-- an optional caption; the facilitator reveals the wall when ready.
--
-- Follows the pattern of 027_step_show_response_field.sql, but also covers
-- activity_library_steps -- which 027 missed, causing show_response_field to be
-- silently reset by the template -> library -> template round trip.
-- ============================================================================

-- Template steps
ALTER TABLE module_steps
  ADD COLUMN is_gallery_step BOOLEAN NOT NULL DEFAULT FALSE;

-- Per-session frozen copies (what participants and the wall actually read)
ALTER TABLE session_snapshot_steps
  ADD COLUMN is_gallery_step BOOLEAN NOT NULL DEFAULT FALSE;

-- Activity library copies. show_response_field is added here too: it was
-- omitted by 027, so saving a module to the library and re-inserting it into a
-- template silently reverted the flag to its default.
ALTER TABLE activity_library_steps
  ADD COLUMN is_gallery_step BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE activity_library_steps
  ADD COLUMN show_response_field BOOLEAN NOT NULL DEFAULT TRUE;

-- Facilitator moderation: keep a specific submission off the projected wall.
-- Persisted rather than held in wall-local state so that hiding an unwanted or
-- sensitive image survives a projector refresh. Submissions are visible by
-- default -- this is a safety valve, not an approval queue.
ALTER TABLE submissions
  ADD COLUMN hidden_from_wall BOOLEAN NOT NULL DEFAULT FALSE;

-- Supports the wall's per-step query: visible submissions for one snapshot step.
CREATE INDEX IF NOT EXISTS idx_submissions_wall
  ON submissions(session_id, step_id)
  WHERE hidden_from_wall = FALSE;

-- ============================================================================
-- Realtime publication
--
-- Migrations 003 and 009 left these statements commented out with a note to run
-- them by hand in the Supabase dashboard, so whether they were ever applied is
-- unknowable from the repo. The projected wall depends on submissions being
-- published, and a channel reports SUBSCRIBED even when its table is not -- so
-- a healthy-looking connection proves nothing. Declare it here, idempotently.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'submissions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.submissions;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'participants'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
    END IF;
  END IF;
EXCEPTION
  -- Altering a publication requires owning it. If the migration role does not,
  -- say so and carry on rather than failing the whole migration: the wall keeps
  -- a 5s reconcile poll precisely so realtime is an optimisation, not a
  -- dependency. Add the tables by hand in Database -> Replication if this fires.
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not add tables to supabase_realtime (insufficient privilege). Add "submissions" and "participants" via Database -> Replication in the Supabase dashboard.';
END $$;

COMMENT ON COLUMN module_steps.is_gallery_step IS
  'When true, participants submit an image + optional caption and the responses are projected on the shared gallery wall. Must be set before a session is created -- resync cannot propagate it to a live session without cascade-deleting submissions.';

COMMENT ON COLUMN submissions.hidden_from_wall IS
  'Facilitator moderation flag. Hidden submissions are not rendered on the projected wall but still count toward the submitted total.';
