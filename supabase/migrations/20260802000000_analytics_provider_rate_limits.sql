-- ChainReactV2 — durable rate limiter for connected-analytics provider queries
-- (Slice ANALYTICS-CONNECTED-DATA-CD-2).
--
-- ChainReact's PROTECTIVE application limit on COLD (cache-miss, coalescing-
-- leader) connected-analytics provider executions — the safeguard the audit
-- (§12) requires before the Custom Insight UI can fan provider-backed widgets
-- out to dashboards. Cache hits and coalesced followers never consume budget;
-- only the leader of a cold query does. This is NOT an attempt to mirror any
-- provider's own global limits.
--
-- Postgres-backed fixed-window counters, mirroring mcp_rate_limits
-- (20260706000002) / api_key_rate_limits (20260608000000): cross-instance,
-- atomic UPSERT increment, tunable numbers kept in code
-- (core/analytics/insightsRateLimitPolicy.ts), TWO dimensions per call:
--   - per account                    'apl:acct:<accountId>:<windowStartMs>'
--   - per account+source (+ optional per-user segment for PERSONAL-credential
--     sources, so later personal providers get user-isolated buckets with no
--     schema change)                 'apl:src:<accountId>:<sourceId>[:u:<userId>]:<windowStartMs>'
-- Bucket keys are derived ids only — NEVER tokens, credentials, or payloads.
-- Rows are opaque counters; no analytics business data lives here.
--
-- Account deletion: bucket keys embed the account id but rows expire within
-- minutes (expires_at) and carry no user data — the standard cleanup path
-- (expiry) covers them; no FK/purge coupling is needed for transient counters.
--
-- ROLLBACK (pre-launch):
--   DROP FUNCTION public.increment_analytics_provider_rate_limits(text, text, timestamptz, timestamptz);
--   DROP TABLE public.analytics_provider_rate_limits;

-- system-table: analytics_provider_rate_limits — service-role-only fixed-window counters; no end-user access.

CREATE TABLE public.analytics_provider_rate_limits (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  CONSTRAINT analytics_provider_rate_limits_pkey PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX analytics_provider_rate_limits_expires_idx
  ON public.analytics_provider_rate_limits (expires_at);

ALTER TABLE public.analytics_provider_rate_limits ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_provider_rate_limits TO service_role;

CREATE POLICY analytics_provider_rate_limits_no_client_access
  ON public.analytics_provider_rate_limits
  FOR ALL USING (false) WITH CHECK (false);

-- Atomic two-dimension fixed-window increment (account bucket + source bucket);
-- returns POST-increment counts. Same-bucket writers serialize on the UPSERT
-- row lock; the two bucket strings always differ (distinct prefixes).
CREATE OR REPLACE FUNCTION public.increment_analytics_provider_rate_limits(
  p_account_bucket text,
  p_source_bucket text,
  p_window_start timestamptz,
  p_expires_at timestamptz
)
RETURNS TABLE (account_count integer, source_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acct integer;
  v_src integer;
BEGIN
  INSERT INTO public.analytics_provider_rate_limits (bucket_key, window_start, count, expires_at)
    VALUES (p_account_bucket, p_window_start, 1, p_expires_at)
    ON CONFLICT (bucket_key, window_start)
    DO UPDATE SET count = public.analytics_provider_rate_limits.count + 1
    RETURNING count INTO v_acct;

  INSERT INTO public.analytics_provider_rate_limits (bucket_key, window_start, count, expires_at)
    VALUES (p_source_bucket, p_window_start, 1, p_expires_at)
    ON CONFLICT (bucket_key, window_start)
    DO UPDATE SET count = public.analytics_provider_rate_limits.count + 1
    RETURNING count INTO v_src;

  RETURN QUERY SELECT v_acct, v_src;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_analytics_provider_rate_limits(text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_analytics_provider_rate_limits(text, text, timestamptz, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_analytics_provider_rate_limits(text, text, timestamptz, timestamptz) TO service_role;
