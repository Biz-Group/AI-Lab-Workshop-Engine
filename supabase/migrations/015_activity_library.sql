-- ============================================================================
-- 015: Activity Library Tables
-- Org-wide reusable activities that can be deep-copied into templates
-- ============================================================================

-- ============================================================================
-- ACTIVITY LIBRARY
-- ============================================================================

CREATE TABLE activity_library (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  objective TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_library_org ON activity_library(organization_id);

-- ============================================================================
-- ACTIVITY LIBRARY STEPS
-- ============================================================================

CREATE TABLE activity_library_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_id UUID NOT NULL REFERENCES activity_library(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  instruction_markdown TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL,
  estimated_minutes INTEGER,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  ai_tool_name TEXT,
  ai_tool_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_library_steps_activity ON activity_library_steps(activity_id);
CREATE INDEX idx_activity_library_steps_order ON activity_library_steps(activity_id, order_index);

-- ============================================================================
-- ACTIVITY LIBRARY PROMPT BLOCKS
-- ============================================================================

CREATE TABLE activity_library_prompt_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  library_step_id UUID NOT NULL REFERENCES activity_library_steps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  is_copyable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_library_blocks_step ON activity_library_prompt_blocks(library_step_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE activity_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_library_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_library_prompt_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access activity_library"
  ON activity_library FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role full access activity_library_steps"
  ON activity_library_steps FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "Service role full access activity_library_prompt_blocks"
  ON activity_library_prompt_blocks FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);
