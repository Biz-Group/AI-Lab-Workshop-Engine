-- ============================================================================
-- 023: Access Requests Table
-- Allows authenticated users to request access to an organization.
-- Org owners approve/deny requests via the /admin/team UI.
-- ============================================================================

-- Helper: check if user is owner of a given org
CREATE OR REPLACE FUNCTION is_owner_of_org(org_id UUID)
  RETURNS BOOLEAN AS $$
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM facilitator_users
      WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role = 'owner'
    );
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Access request status enum
CREATE TYPE access_request_status AS ENUM ('pending', 'approved', 'denied');

-- Access requests table
CREATE TABLE access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  status access_request_status NOT NULL DEFAULT 'pending',
  requested_role user_role NOT NULL DEFAULT 'facilitator',
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_user_org_request UNIQUE (user_id, organization_id)
);

-- Indexes
CREATE INDEX idx_access_requests_org_status ON access_requests(organization_id, status);
CREATE INDEX idx_access_requests_user ON access_requests(user_id);

-- Enable RLS
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own request
CREATE POLICY "Users can request access"
  ON access_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can view their own requests
CREATE POLICY "Users can view own requests"
  ON access_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Org owners can view all requests for their org
CREATE POLICY "Owners view org requests"
  ON access_requests FOR SELECT
  TO authenticated
  USING (is_owner_of_org(organization_id));

-- Policy: Org owners can update requests for their org (approve/deny)
CREATE POLICY "Owners manage org requests"
  ON access_requests FOR UPDATE
  TO authenticated
  USING (is_owner_of_org(organization_id))
  WITH CHECK (is_owner_of_org(organization_id));
