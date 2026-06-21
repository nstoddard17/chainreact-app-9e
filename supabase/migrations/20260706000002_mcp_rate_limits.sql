-- ChainReactV2 — durable rate limiter for the public MCP server
-- (Slice 4.PUBLIC-MCP-3).
--
-- A DURABLE, cross-instance fixed-window limiter so the public MCP endpoint
-- (app/mcp/route.ts) can be enabled outside local/dev. No Redis/Upstash exists in
-- the repo, so this is Postgres-backed — mirroring the api_key_rate_limits design
-- (20260608000000) but with TWO dimensions (per token / per account) since the MCP
-- surface has no per-workflow dimension.
--
-- public.mcp_rate_limits is a SERVICE-ROLE-ONLY system table holding opaque
-- per-window counters keyed by derived bucket strings (token id / account id —
-- NEVER a raw token or token_hash). It is not user-facing.
--
-- ROLLBACK (pre-launch, no prod data):
--   DROP FUNCTION public.increment_mcp_rate_limits(text, text, timestamptz, timestamptz);
--   DROP TABLE public.mcp_rate_limits;

-- system-table: mcp_rate_limits — service-role-only fixed-window counters; no end-user access.

CREATE TABLE public.mcp_rate_limits (
  -- Derived bucket identity, e.g. 'mcp:tok:<tokenId>:<windowStartMs>' /
  -- 'mcp:acct:<accountId>:<windowStartMs>'. NEVER a raw token or token_hash.
  bucket_key text NOT NULL,
  -- Aligned start of the fixed window (epoch-floored to the window size).
  window_start timestamptz NOT NULL,
  -- Post-increment request count in this (bucket, window).
  count integer NOT NULL DEFAULT 0,
  -- window_start + window size; cleanup deletes rows past this.
  expires_at timestamptz NOT NULL,
  CONSTRAINT mcp_rate_limits_pkey PRIMARY KEY (bucket_key, window_start)
);

-- Cleanup scan (a future cron prunes rows past expires_at; expired rows are also
-- harmless — a new window simply starts a fresh count).
CREATE INDEX mcp_rate_limits_expires_idx ON public.mcp_rate_limits (expires_at);

-- System-only table; no user-facing access. RLS enabled defense-in-depth with a
-- deny-all policy so any client query is empty even with a stolen anon key; the
-- service role bypasses RLS for the limiter RPC. authenticated is granted NOTHING.
ALTER TABLE public.mcp_rate_limits ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_rate_limits TO service_role;

CREATE POLICY mcp_rate_limits_no_client_access ON public.mcp_rate_limits
  FOR ALL USING (false) WITH CHECK (false);

-- Atomic two-dimension fixed-window increment. One call bumps the per-token and
-- per-account buckets for the current window and returns each POST-increment count.
-- Runs in a single transaction so concurrent requests across instances increment
-- consistently (the UPSERT row lock serializes same-bucket writers). The two bucket
-- strings always differ (distinct prefixes), so there is no self-conflict within a
-- single call. The caller compares the returned counts to the centralized limits
-- (core/mcp/rateLimitPolicy.ts) — keeping the tunable numbers in code, not the DB.
CREATE OR REPLACE FUNCTION public.increment_mcp_rate_limits(
  p_token_bucket text,
  p_account_bucket text,
  p_window_start timestamptz,
  p_expires_at timestamptz
)
RETURNS TABLE (token_count integer, account_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok integer;
  v_acct integer;
BEGIN
  INSERT INTO public.mcp_rate_limits (bucket_key, window_start, count, expires_at)
    VALUES (p_token_bucket, p_window_start, 1, p_expires_at)
    ON CONFLICT (bucket_key, window_start)
    DO UPDATE SET count = public.mcp_rate_limits.count + 1
    RETURNING count INTO v_tok;

  INSERT INTO public.mcp_rate_limits (bucket_key, window_start, count, expires_at)
    VALUES (p_account_bucket, p_window_start, 1, p_expires_at)
    ON CONFLICT (bucket_key, window_start)
    DO UPDATE SET count = public.mcp_rate_limits.count + 1
    RETURNING count INTO v_acct;

  RETURN QUERY SELECT v_tok, v_acct;
END;
$$;

-- Service-role only — never PUBLIC / anon / authenticated. The limiter is a
-- server-side chokepoint, unreachable from the Data API.
REVOKE ALL ON FUNCTION public.increment_mcp_rate_limits(text, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_mcp_rate_limits(text, text, timestamptz, timestamptz) TO service_role;
