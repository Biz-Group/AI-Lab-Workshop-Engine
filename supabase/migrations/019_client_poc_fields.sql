-- ============================================================================
-- 019: Add POC fields to approved_clients
-- Stores default poc_name + poc_email per client for autofill
-- ============================================================================

ALTER TABLE approved_clients
  ADD COLUMN IF NOT EXISTS poc_name TEXT,
  ADD COLUMN IF NOT EXISTS poc_email TEXT;

-- ============================================================================
-- Seed two sample clients (uses the first org found)
-- Remove or adjust for your environment
-- ============================================================================

INSERT INTO approved_clients (organization_id, name, poc_name, poc_email)
SELECT o.id, 'Acme Corporation', 'Jane Smith', 'jane@acme.com'
FROM organizations o LIMIT 1
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO approved_clients (organization_id, name, poc_name, poc_email)
SELECT o.id, 'Globex Industries', 'John Doe', 'john@globex.com'
FROM organizations o LIMIT 1
ON CONFLICT (organization_id, name) DO NOTHING;
