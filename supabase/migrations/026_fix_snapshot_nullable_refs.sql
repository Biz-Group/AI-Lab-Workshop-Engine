-- Fix NOT NULL constraint on snapshot reference columns that use ON DELETE SET NULL.
-- When a template module/step/block is deleted, Postgres tries to set these to NULL
-- but the NOT NULL constraint rejects it, causing a 500 on every delete.

ALTER TABLE session_snapshot_modules
  ALTER COLUMN original_module_id DROP NOT NULL;

ALTER TABLE session_snapshot_steps
  ALTER COLUMN original_step_id DROP NOT NULL;

ALTER TABLE session_snapshot_prompt_blocks
  ALTER COLUMN original_block_id DROP NOT NULL;
