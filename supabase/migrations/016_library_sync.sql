-- ============================================================================
-- 016: Auto-sync template modules to activity library
-- Adds source_module_id tracking + backfills existing modules
-- ============================================================================

-- Add source_module_id to track which template module a library activity came from
ALTER TABLE activity_library
  ADD COLUMN source_module_id UUID REFERENCES modules(id) ON DELETE SET NULL;

-- Unique partial index: one library entry per source module
CREATE UNIQUE INDEX idx_activity_library_source_module
  ON activity_library(source_module_id)
  WHERE source_module_id IS NOT NULL;

-- Backfill: create library entries for all existing template modules
INSERT INTO activity_library (organization_id, title, objective, source_module_id)
SELECT t.organization_id, m.title, m.objective, m.id
FROM modules m
JOIN workshop_templates t ON m.template_id = t.id
WHERE NOT EXISTS (
  SELECT 1 FROM activity_library al WHERE al.source_module_id = m.id
);
