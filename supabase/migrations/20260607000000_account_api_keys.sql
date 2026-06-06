-- ChainReactV2 — account-scoped API keys foundation
-- (Slice 4.API-KEYS-FOUNDATION-2 / FK-1).
--
-- Schema-only foundation per docs/slices/phase-4/api-keys-foundation-plan.md.
-- STRUCTURE ONLY: no management routes, no public trigger endpoint, no bearer-auth
-- wiring, no UI, no billing, no rate limiting, and NO OAuth/integration token
-- access. No row is read, written, or backfilled. CHANGES NO RUNTIME BEHAVIOR.
--
-- public.account_api_keys stores per-account API keys as a one-way SHA-256 hash +
-- a display prefix. The RAW key is generated + revealed exactly once by a later
-- slice (FK-2) and is NEVER stored. `key_hash` must NEVER be readable by the
-- `authenticated` role — there is NO authenticated GRANT on this table at all, so
-- clients cannot reach it through the Data API. All reads go through the
-- service-role repository (repositories/accountApiKeys.ts) as hash-omitting
-- metadata DTOs, mirroring how member identities are served via a projection
-- rather than a raw table SELECT. Writes are service-role only.
--
-- Scope classification (which scopes a key MAY be created with at launch) lives in
-- code (core/apiKeys/scopes.ts), enforced at the repo/service boundary. The DB
-- CHECK only constrains values to the KNOWN scope set; the launch-ENABLED subset
-- (only 'workflows:trigger') is enforced in code so the enum stays forward-stable
-- without a migration when more scopes are enabled.
--
-- ROLLBACK (pre-launch, no prod data): DROP TABLE public.account_api_keys.
-- Nothing depends on it (this slice wires no caller), so this is a clean reverse.

CREATE TABLE public.account_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owning account. ON DELETE CASCADE: a key has no meaning without its account.
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- Who minted the key (owner/admin, later slices). Provenance only — SET NULL if
  -- that user is later deleted; the key keeps working as an account credential.
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Human label, e.g. 'CI deploy trigger'.
  name text NOT NULL,

  -- DISPLAY identifier only (e.g. 'crk_live_AbCd1234'): the non-secret leading
  -- segment of the raw key. Indexed for lookup/grouping; carries no authority.
  prefix text NOT NULL,

  -- sha256(raw key), hex. The raw key is NEVER stored. UNIQUE so verification is an
  -- O(1) exact-match lookup. NEVER granted to authenticated (see GRANTs below).
  key_hash text NOT NULL,

  -- Least-privilege scopes. The DB constrains values to the KNOWN set; the
  -- launch-ENABLED subset ('workflows:trigger' only) is enforced in code.
  scopes text[] NOT NULL
    CONSTRAINT account_api_keys_scopes_nonempty CHECK (array_length(scopes, 1) >= 1)
    CONSTRAINT account_api_keys_scopes_known CHECK (
      scopes <@ ARRAY['workflows:trigger', 'workflows:read', 'workflows:manage', 'account:read']::text[]
    ),

  last_used_at timestamptz,   -- best-effort, throttled (repo touchLastUsed; FK-4)
  expires_at timestamptz,     -- nullable = no expiry by default
  revoked_at timestamptz,     -- soft revoke; the verify path rejects revoked keys

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Exact-match verification key. A sha256 collision (astronomically unlikely)
  -- would reject the second insert — acceptable; regenerate.
  CONSTRAINT account_api_keys_key_hash_unique UNIQUE (key_hash)
);

-- List an account's keys (management read path, FK-2/FK-3).
CREATE INDEX account_api_keys_account_idx ON public.account_api_keys (account_id);

-- Prefix lookup / display grouping (the prefix is non-secret).
CREATE INDEX account_api_keys_prefix_idx ON public.account_api_keys (prefix);

-- "Active keys for an account" — the common management + future-verify filter.
CREATE INDEX account_api_keys_active_idx
  ON public.account_api_keys (account_id)
  WHERE revoked_at IS NULL;

CREATE TRIGGER account_api_keys_set_updated_at
  BEFORE UPDATE ON public.account_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
--
-- key_hash must NEVER be client-readable, so there is NO `authenticated` GRANT on
-- this table — clients cannot reach it through the Data API at all (a SELECT as
-- authenticated returns 42501). All reads flow through the service-role repository
-- which returns hash-omitting metadata DTOs. Writes are service-role only (the
-- owner/admin management routes call the repo in FK-2). The membership-+-freeze
-- SELECT policy is retained as defense-in-depth, in case a column-narrowed
-- authenticated GRANT is ever added later.

ALTER TABLE public.account_api_keys ENABLE ROW LEVEL SECURITY;

-- Data API access (explicit GRANTs required after Supabase removes implicit grants
-- on public tables, Oct 30 2026). service_role owns all access; authenticated is
-- granted NOTHING — there is no key_hash leakage path.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_api_keys TO service_role;

CREATE POLICY account_api_keys_select_account_member
  ON public.account_api_keys
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.account_id = account_api_keys.account_id
        AND am.user_id = auth.uid()
        AND a.deletion_status = 'active'
    )
  );
