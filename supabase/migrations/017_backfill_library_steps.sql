-- ============================================================================
-- 017: Backfill activity_library_steps + activity_library_prompt_blocks
-- Migration 016 only backfilled activity_library rows (title + objective).
-- This migration copies the corresponding module_steps and prompt_blocks
-- into the library tables for all previously backfilled entries.
-- Idempotent: skips activities that already have library steps.
-- ============================================================================

DO $$
DECLARE
  act RECORD;
  src_step RECORD;
  new_step_id UUID;
BEGIN
  -- Loop through backfilled library activities that have no steps yet
  FOR act IN
    SELECT al.id AS activity_id, al.source_module_id
    FROM activity_library al
    WHERE al.source_module_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM activity_library_steps als
        WHERE als.activity_id = al.id
      )
  LOOP
    -- Copy each module_step into the library
    FOR src_step IN
      SELECT id, title, instruction_markdown, order_index,
             estimated_minutes, is_required, ai_tool_name, ai_tool_url
      FROM module_steps
      WHERE module_id = act.source_module_id
      ORDER BY order_index
    LOOP
      INSERT INTO activity_library_steps (
        activity_id, title, instruction_markdown, order_index,
        estimated_minutes, is_required, ai_tool_name, ai_tool_url
      ) VALUES (
        act.activity_id, src_step.title, src_step.instruction_markdown,
        src_step.order_index, src_step.estimated_minutes, src_step.is_required,
        src_step.ai_tool_name, src_step.ai_tool_url
      ) RETURNING id INTO new_step_id;

      -- Copy prompt_blocks for this step
      INSERT INTO activity_library_prompt_blocks (
        library_step_id, title, content_markdown, order_index, is_copyable
      )
      SELECT new_step_id, pb.title, pb.content_markdown, pb.order_index, pb.is_copyable
      FROM prompt_blocks pb
      WHERE pb.step_id = src_step.id
      ORDER BY pb.order_index;
    END LOOP;
  END LOOP;
END $$;
