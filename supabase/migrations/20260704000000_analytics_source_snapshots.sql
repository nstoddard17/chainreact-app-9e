-- ChainReactV2 — Analytics source snapshots / cache (Slice ANALYTICS-SOURCES-CACHE-1).
--
-- TTL cache of NORMALIZED analytics-source results so connected-app widgets
-- (e.g. GitHub) can be exposed later without hammering provider APIs (GitHub
-- search is 30 req/min). One row per stable cache key; the cache layer upserts in
-- place and reads cache-first.
--
-- STORES NORMALIZED RESULTS ONLY (the NormalizedAnalyticsResult shape validated by
-- services/analytics/sources/types.ts on read + write). NEVER raw provider
-- payloads, access tokens, raw request/response bodies, or raw external ids beyond
-- what the normalized result intentionally carries. Structurally credential-free
-- (no token columns; the cache layer only ever writes a validated result blob).
--
-- PERSONAL-CREDENTIAL ISOLATION (the key security property): GitHub is a PERSONAL
-- credential (core/integrations/credentialSharing.ts), so a snapshot produced from
-- a member's personal connection MUST NOT become account-wide. `source_user_id`
-- carries the producing user for personal-credential sources (NULL = produced from
-- an account-shared credential → account-visible). BOTH the cache key (includes
-- source_user_id) AND the RLS SELECT policy (personal rows readable only by that
-- user) enforce it, so one member's personal GitHub data never leaks to co-members.
--
-- ROLLBACK (pre-launch, no prod data): DROP TABLE public.analytics_source_snapshots.

CREATE TABLE public.analytics_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owning account — scope + authority root. CASCADE: snapshots are disposable.
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- The user whose PERSONAL credential produced this snapshot. NULL = produced
  -- from an account-shared credential (account-visible). NON-NULL = personal
  -- source — visible ONLY to that user (RLS + cache key both enforce it). CASCADE:
  -- if the user is deleted, their personal snapshots go with them.
  source_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  provider_key text NOT NULL,
  metric_key text NOT NULL,
  -- Normalized date-range bucket key (UTC day granularity) — so repeated loads in
  -- the same window share a row; TTL bounds staleness.
  range_key text NOT NULL,
  group_by text,
  -- Deterministic SHA-256 of the (canonicalized) filters — part of the key.
  filters_hash text NOT NULL,

  -- Deterministic key over (account, source_user, provider, metric, range_key,
  -- group_by, filters_hash). UNIQUE → the cache upserts in place.
  cache_key text NOT NULL,

  -- NormalizedAnalyticsResult ONLY (validated on read + write). No raw payloads.
  result jsonb NOT NULL,

  generated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX analytics_source_snapshots_cache_key
  ON public.analytics_source_snapshots (cache_key);
CREATE INDEX analytics_source_snapshots_account_idx
  ON public.analytics_source_snapshots (account_id);
CREATE INDEX analytics_source_snapshots_expires_idx
  ON public.analytics_source_snapshots (expires_at);

CREATE TRIGGER analytics_source_snapshots_set_updated_at
  BEFORE UPDATE ON public.analytics_source_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
--
-- Reads: an ACTIVE member of the account may SELECT a snapshot, AND — for a
-- personal-source row (source_user_id NOT NULL) — only when they ARE that user.
-- Account-shared rows (source_user_id NULL) are visible to every member. So a
-- co-member can never read another member's personal-credential snapshot.
--
-- Writes: SERVICE-ROLE ONLY (no authenticated write grant). The cache layer
-- writes via the service-role repository AFTER the query path authorized + pinned
-- the credential. Defense-in-depth: the cache key already encodes account_id +
-- source_user_id, so a service-role get-by-key is inherently scoped.

ALTER TABLE public.analytics_source_snapshots ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.analytics_source_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_source_snapshots TO service_role;

CREATE POLICY analytics_source_snapshots_select_member_scoped
  ON public.analytics_source_snapshots
  FOR SELECT
  USING (
    (source_user_id IS NULL OR source_user_id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.account_id = analytics_source_snapshots.account_id
        AND am.user_id = auth.uid()
        AND a.deletion_status = 'active'
    )
  );
