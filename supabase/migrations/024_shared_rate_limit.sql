-- ============================================================================
-- 024: Shared distributed rate limiting primitives
-- ============================================================================

CREATE TABLE IF NOT EXISTS request_rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_rate_limits_updated_at
  ON request_rate_limits(updated_at);

-- Consume one request in a fixed window and return allowance metadata.
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

-- Service role calls this from API routes.
GRANT EXECUTE ON FUNCTION consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
