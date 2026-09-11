-- ============================================================================
-- 032: Bound request_rate_limits growth
--
-- consume_rate_limit() (migration 024) UPSERTs a row per unique key on nearly
-- every API request (join, verify, submit, upload, email, pdf, analytics,
-- feedback -- see checkRateLimit() call sites), and nothing ever deletes a
-- row. Two things compound from that:
--   1. The table grows forever -- one row per participant/IP/session-IP/email
--      combination ever seen, across every workshop this project runs.
--   2. Every one of those UPSERTs is an UPDATE on a hot table, which in
--      Postgres MVCC leaves a dead row version behind each time. Autovacuum
--      normally reclaims those, but on a table that also grows without bound
--      it keeps falling further behind, and the resulting table/index bloat
--      means more pages have to be read for the exact same query over time.
-- That combination -- unbounded row growth plus continuous UPDATE churn on
-- the same small set of hot keys -- is the textbook cause of a Supabase
-- "Disk IO budget" warning, so this is the top suspect for it in this schema.
--
-- No windowed key in this codebase has a window longer than 10 minutes
-- (checkRateLimit() call sites cap out at 10 * 60_000ms), so any row idle for
-- over an hour is provably expired and safe to drop. Deleting is folded into
-- consume_rate_limit() itself with low probability rather than run on every
-- call (avoiding adding a table scan to the hot path) or via pg_cron
-- (whether that extension is enabled here is not knowable from the repo, the
-- same reasoning migration 028 used for ALTER PUBLICATION) -- this needs no
-- extension and keeps the table self-bounding under normal traffic.
-- ============================================================================

CREATE OR REPLACE FUNCTION consume_rate_limit(
  p_key TEXT,
  p_max INTEGER,
  p_window_seconds INTEGER DEFAULT 60
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  now_ts TIMESTAMPTZ := now();
  window_interval INTERVAL;
  new_count INTEGER;
  active_window_start TIMESTAMPTZ;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RAISE EXCEPTION 'p_key is required';
  END IF;

  IF p_max < 1 THEN
    RAISE EXCEPTION 'p_max must be >= 1';
  END IF;

  IF p_window_seconds < 1 THEN
    RAISE EXCEPTION 'p_window_seconds must be >= 1';
  END IF;

  window_interval := make_interval(secs => p_window_seconds);

  -- Opportunistic sweep, ~1 in 200 calls: every window in this codebase is
  -- <=10 minutes, so anything untouched for an hour is dead regardless of
  -- which key it belongs to.
  IF random() < 0.005 THEN
    DELETE FROM public.request_rate_limits
    WHERE updated_at < now_ts - INTERVAL '1 hour';
  END IF;

  INSERT INTO public.request_rate_limits AS r (key, window_start, request_count, updated_at)
  VALUES (p_key, now_ts, 1, now_ts)
  ON CONFLICT (key) DO UPDATE
    SET request_count = CASE
      WHEN now_ts - r.window_start >= window_interval THEN 1
      ELSE r.request_count + 1
    END,
    window_start = CASE
      WHEN now_ts - r.window_start >= window_interval THEN now_ts
      ELSE r.window_start
    END,
    updated_at = now_ts
  RETURNING request_count, window_start
  INTO new_count, active_window_start;

  RETURN QUERY
  SELECT
    (new_count <= p_max) AS allowed,
    GREATEST(0, p_max - new_count) AS remaining,
    active_window_start + window_interval AS reset_at;
END;
$$;

-- One-time cleanup of whatever has already accumulated -- the opportunistic
-- sweep above only bounds growth going forward.
DELETE FROM public.request_rate_limits WHERE updated_at < now() - INTERVAL '1 hour';
