-- ============================================================================
-- 018: Approved Clients + POC Email
-- 1. New approved_clients table (per-org approved client names)
-- 2. Add poc_email column to sessions
-- ============================================================================

-- ============================================================================
-- APPROVED CLIENTS TABLE
-- ============================================================================

CREATE TABLE approved_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approved_clients_org ON approved_clients(organization_id);
CREATE UNIQUE INDEX idx_approved_clients_org_name ON approved_clients(organization_id, name);

-- RLS
ALTER TABLE approved_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access approved_clients"
  ON approved_clients FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- ADD poc_email TO SESSIONS
-- ============================================================================

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS poc_email TEXT;
