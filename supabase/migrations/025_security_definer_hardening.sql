-- ============================================================================
-- 025: Harden SECURITY DEFINER functions + tighten access request insert policy
-- ============================================================================

CREATE OR REPLACE FUNCTION is_facilitator_of_org(org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.facilitator_users
    WHERE user_id = auth.uid()
      AND organization_id = org_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_admin_of_org(org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.facilitator_users
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role IN ('owner', 'admin')
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT organization_id FROM public.facilitator_users
  WHERE user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION is_owner_of_org(org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.facilitator_users
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role = 'owner'
  );
END;
$$;

REVOKE ALL ON FUNCTION is_facilitator_of_org(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION is_admin_of_org(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_user_org_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION is_owner_of_org(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION is_facilitator_of_org(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_admin_of_org(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_user_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_owner_of_org(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can request access" ON access_requests;

CREATE POLICY "Users can request access"
  ON access_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND requested_role = 'facilitator'
  );

