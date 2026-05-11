-- Migration 022: Add prompt_pack_emailed_at to participants for n8n webhook email delivery
-- Tracks whether/when a participant received their prompt pack via email.
-- Used by the delayed-send polling endpoint to avoid duplicates.

ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS prompt_pack_emailed_at TIMESTAMPTZ DEFAULT NULL;

-- Index for the delayed-send query: feedback done, email not yet sent, has email + consent
CREATE INDEX IF NOT EXISTS idx_participants_prompt_pack_due
  ON participants (feedback_submitted, prompt_pack_emailed_at)
  WHERE feedback_submitted = TRUE
    AND prompt_pack_emailed_at IS NULL
    AND email IS NOT NULL
    AND email_consent = TRUE;
