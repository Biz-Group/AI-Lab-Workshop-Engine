-- Add show_response_field to module_steps and session_snapshot_steps.
-- Controls whether the submission textarea is shown to participants on a given step.
-- Defaults to true to preserve existing behaviour for all existing steps.

ALTER TABLE module_steps
  ADD COLUMN show_response_field BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE session_snapshot_steps
  ADD COLUMN show_response_field BOOLEAN NOT NULL DEFAULT TRUE;
