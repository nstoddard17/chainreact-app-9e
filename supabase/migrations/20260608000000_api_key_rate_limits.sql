-- ChainReactV2 — durable rate limiter for public API-key triggers
-- (Slice 4.API-KEYS-RATE-LIMIT-1).
--
-- Replaces the permissive placeholder seam (services/apiKeys/rateLimit.ts) with a
-- DURABLE, cross-instance fixed-window limiter so ENABLE_PUBLIC_API_KEYS can be
-- turned on outside local/dev. No Redis/Upstash dependency exists in the repo, so
-- this is Postgres-backed: one counter row per (bucket_key, window) and an atomic
-- multi-dimension increment RPC.
--
-- This changes NO API-key management, billing, workflow, or public-API-scope
-- behavior — it only wires real throttling into the existing trigger route.
--
-- public.api_key_rate_limits is a SERVICE-ROLE-ONLY system table: it holds opaque
-- per-window counters keyed by derived bucket strings (key id / account id /
-- workflow id — NEVER a raw API key or key_hash). It is not user-facing.
--
-- ROLLBACK (pre-launch, no prod data):
--   DROP FUNCTION public.increment_api_key_rate_limits(text, text, text, timestamptz, timestamptz);
--   DROP TABLE public.api_key_rate_limits;

-- system-table: api_key_rate_limits — service-role-only fixed-window counters; no end-user access.

CREATE TABLE public.api_key_rate_limits (
  -- Derived bucket identity, e.g. 'key:<keyId>:<windowStartMs>' /
  -- 'wf:<accountId>:<workflowId>:<windowStartMs>' / 'acct:<accountId>:<windowStartMs>'.
  -- NEVER contains a raw key or key_hash.
  bucket_key text NOT NULL,
  -- Aligned start of the fixed window (epoch-floored to the window size).
  window_start timestamptz NOT NULL,
  -- Post-increment request count in this (bucket, window).
  count integer NOT NULL DEFAULT 0,
  -- window_start + window size; cleanup deletes rows past this.
  expires_at timestamptz NOT NULL,
  CONSTRAINT api_key_rate_limits_pkey PRIMARY KEY (bucket_key, window_start)
);

-- Cleanup scan (a future cron prunes rows past expires_at; expired rows are also
-- harmless — a new window simply starts a fresh count).
CREATE INDEX api_key_rate_limits_expires_idx ON public.api_key_rate_limits (expires_at);

-- System-only table; no user-facing access. RLS is enabled defense-in-depth with a
-- deny-all policy so any client query is empty even with a stolen anon key; the
-- service role bypasses RLS for the limiter RPC. authenticated is granted NOTHING.
ALTER TABLE public.api_key_rate_limits ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_key_rate_limits TO service_role;

CREATE POLICY api_key_rate_limits_no_client_access ON public.api_key_rate_limits
  FOR ALL USING (false) WITH CHECK (false);

-- Atomic multi-dimension fixed-window increment. One call bumps the per-key,
-- per-workflow, and per-account buckets for the current window and returns each
-- POST-increment count. Runs in a single transaction so concurrent triggers across
-- instances increment consistently (the UPSERT row lock serializes same-bucket
-- writers). The three bucket strings always differ (distinct prefixes), so there is
-- no self-conflict within a single call. The caller compares the returned counts to
-- the centralized limits (core/apiKeys/rateLimitPolicy.ts) — keeping the tunable
-- numbers in code, not the DB.
CREATE OR REPLACE FUNCTION public.increment_api_key_rate_limits(
  p_key_bucket text,
  p_workflow_bucket text,
  p_account_bucket text,
  p_window_start timestamptz,
  p_expires_at timestamptz
)
RETURNS TABLE (key_count integer, workflow_count integer, account_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key integer;
  v_wf integer;
  v_acct integer;
BEGIN
  INSERT INTO public.api_key_rate_limits (bucket_key, window_start, count, expires_at)
    VALUES (p_key_bucket, p_window_start, 1, p_expires_at)
    ON CONFLICT (bucket_key, window_start)
    DO UPDATE SET count = public.api_key_rate_limits.count + 1
    RETURNING count INTO v_key;

  INSERT INTO public.api_key_rate_limits (bucket_key, window_start, count, expires_at)
    VALUES (p_workflow_bucket, p_window_start, 1, p_expires_at)
    ON CONFLICT (bucket_key, window_start)
    DO UPDATE SET count = public.api_key_rate_limits.count + 1
    RETURNING count INTO v_wf;

  INSERT INTO public.api_key_rate_limits (bucket_key, window_start, count, expires_at)
    VALUES (p_account_bucket, p_window_start, 1, p_expires_at)
    ON CONFLICT (bucket_key, window_start)
    DO UPDATE SET count = public.api_key_rate_limits.count + 1
    RETURNING count INTO v_acct;

  RETURN QUERY SELECT v_key, v_wf, v_acct;
END;
$$;

-- Service-role only — never PUBLIC / anon / authenticated. The limiter is a
-- server-side chokepoint, unreachable from the Data API.
REVOKE ALL ON FUNCTION public.increment_api_key_rate_limits(text, text, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_api_key_rate_limits(text, text, text, timestamptz, timestamptz) TO service_role;
