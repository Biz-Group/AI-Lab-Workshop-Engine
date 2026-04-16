-- Fix leads table: add unique constraint needed for upsert and correct index column name

-- Required for: upsert({ onConflict: 'organization_id,email' }) in email prompt-pack route
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_org_email ON leads(organization_id, email);

-- Migration 006 created idx_leads_session_id on non-existent column source_session_id.
-- Drop it and recreate on the actual column name.
DROP INDEX IF EXISTS idx_leads_session_id;
CREATE INDEX IF NOT EXISTS idx_leads_session_id ON leads(session_id);
