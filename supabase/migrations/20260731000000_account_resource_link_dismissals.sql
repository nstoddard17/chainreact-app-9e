-- 5.TRUCK-BRIDGE-1 CS-5 — dismissed vehicle-match suggestions.
--
-- Plan: docs/slices/phase-5/truck-bridge-vehicle-mapping-plan.md §4.5 + §11f.
--
-- WHAT THIS IS: a record that a human looked at a PROPOSED Motive↔Fleetio
-- vehicle pairing and said "no". Without it, every page load recomputes the same
-- proposals from the same two provider lists and the rejected suggestion comes
-- straight back — the screen would be unusable for any fleet with near-miss
-- names or shared plates.
--
-- ── This is NOT a link, and must never become one ──────────────────────────
-- A row here is the OPPOSITE of `account_resource_links`: it records a REJECTED
-- correspondence, never an accepted one. Nothing in the execution path reads
-- this table — `fleetio:find_linked_vehicle` resolves only confirmed links, so a
-- dismissal can never cause a workflow to resolve, skip, or mis-route a vehicle.
-- Its entire blast radius is which rows the Suggested tab shows.
--
-- ── Why the evidence fingerprint ───────────────────────────────────────────
-- A dismissal suppresses a pair only while the REASON it was proposed is
-- unchanged. `evidence_fingerprint` stores `<tier>|<evidence text>` as the
-- service rendered it at dismissal time. If a fleet manager later fixes a VIN in
-- Motive and the same pair starts matching on VIN instead of a weak name token,
-- the fingerprint no longer matches and the suggestion legitimately returns —
-- the user is being shown a materially different claim and deserves to judge it
-- again. This is deliberately a dumb equality check, not a recommendation
-- system: no decay, no scoring, no re-ranking.
--
-- ── What is deliberately NOT stored ────────────────────────────────────────
-- No tokens, no credentials, no integration ids, no VIN / plate / make / model,
-- no provider payloads, and no user-owned authorization column. The fingerprint
-- is display evidence the user already saw on their own screen; it is bounded
-- and never parsed.
--
-- ── Ownership (docs/rules/account-ownership-model.md) ──────────────────────
-- `account_id` is the SOLE ownership column. `dismissed_by_user_id` is
-- PROVENANCE ONLY (ON DELETE SET NULL) — a dismissal belongs to the account, not
-- to the person who clicked, and it MUST NEVER be consulted for authorization.
--
-- ── Lifecycle ──────────────────────────────────────────────────────────────
-- Soft, mirroring `account_resource_links`: dismissals are ARCHIVED, never
-- hard-deleted, so "why did this stop being suggested in July?" stays
-- answerable. The uniqueness index is PARTIAL on active rows, so archiving a
-- dismissal immediately frees the pair to be dismissed again with new evidence.
--
-- ROLLBACK (pre-launch; the table is read only by the flag-gated Suggested tab):
--   DROP TABLE public.account_resource_link_dismissals;

CREATE TABLE public.account_resource_link_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sole ownership column. CASCADE: a dismissal has no meaning without its account.
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- Same v1 scope as the links table; widening is a forward-only CHECK migration.
  resource_kind text NOT NULL
    CONSTRAINT arld_resource_kind_known
    CHECK (resource_kind IN ('vehicle')),

  -- The REJECTED pairing. Same bounded shape as account_resource_links, so a
  -- dismissal and a link describe the same pair in the same vocabulary.
  source_provider text NOT NULL
    CONSTRAINT arld_source_provider_bounded
    CHECK (btrim(source_provider) <> '' AND length(source_provider) <= 64),
  source_external_id text NOT NULL
    CONSTRAINT arld_source_external_id_bounded
    CHECK (btrim(source_external_id) <> '' AND length(source_external_id) <= 256),
  target_provider text NOT NULL
    CONSTRAINT arld_target_provider_bounded
    CHECK (btrim(target_provider) <> '' AND length(target_provider) <= 64),
  target_external_id text NOT NULL
    CONSTRAINT arld_target_external_id_bounded
    CHECK (btrim(target_external_id) <> '' AND length(target_external_id) <= 256),

  -- Which evidence tier the user was shown when they rejected it.
  match_tier text NOT NULL
    CONSTRAINT arld_match_tier_known
    CHECK (match_tier IN ('vin', 'plate', 'number', 'name')),

  -- `<tier>|<evidence>` exactly as rendered at dismissal time. Compared for
  -- EQUALITY only — never parsed, never interpolated into SQL.
  evidence_fingerprint text NOT NULL
    CONSTRAINT arld_evidence_fingerprint_bounded
    CHECK (btrim(evidence_fingerprint) <> '' AND length(evidence_fingerprint) <= 512),

  -- Audit. PROVENANCE ONLY, never authorization.
  dismissed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Required, no DEFAULT — the writer states when the rejection happened.
  dismissed_at timestamptz NOT NULL,

  -- Soft lifecycle (see header).
  archived_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A dismissal, like a link, must describe two DISTINCT identities.
  CONSTRAINT arld_distinct_sides CHECK (
    source_provider <> target_provider OR source_external_id <> target_external_id
  )
);

-- One ACTIVE dismissal per proposed pair. Partial, so archiving frees the pair.
-- Note this is keyed on the PAIR and NOT on the fingerprint: a pair has at most
-- one live rejection, and re-dismissing with new evidence replaces it (archive
-- then insert) rather than accumulating a row per evidence variant.
CREATE UNIQUE INDEX account_resource_link_dismissals_pair_unique
  ON public.account_resource_link_dismissals
     (account_id, resource_kind, source_provider, source_external_id,
      target_provider, target_external_id)
  WHERE archived_at IS NULL;

-- The Suggested tab's read: every active dismissal for one account + kind.
CREATE INDEX account_resource_link_dismissals_account_idx
  ON public.account_resource_link_dismissals (account_id, resource_kind, dismissed_at DESC);

CREATE TRIGGER account_resource_link_dismissals_set_updated_at
  BEFORE UPDATE ON public.account_resource_link_dismissals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS + GRANTs ────────────────────────────────────────────────────────────
-- Identical posture to account_resource_links (20260729000000): SERVICE-ROLE
-- ONLY at the Data API layer, with a membership-gated SELECT policy as
-- defense-in-depth.
--
-- BE PRECISE: the service role BYPASSES RLS, so the policy below does NOT
-- constrain the repository. What enforces tenant isolation on every repository
-- call is the mandatory `account_id` predicate — which is why `accountId` is the
-- first parameter of every exported function and no function can address a
-- dismissal by id alone. The policy is what keeps this table safe IF a future
-- slice ever grants `authenticated` a direct SELECT. Writes have no policy at
-- all, so RLS denies them outright.

ALTER TABLE public.account_resource_link_dismissals ENABLE ROW LEVEL SECURITY;

-- MANDATORY REVOKE FIRST (see 20260725000000): this project carries
-- `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated,
-- service_role`, so a new `public` table arrives with FULL anon + authenticated
-- privileges regardless of what this migration grants. Granting narrowly does
-- NOT end up narrow — the surplus must be revoked explicitly.
REVOKE ALL ON public.account_resource_link_dismissals FROM anon;
REVOKE ALL ON public.account_resource_link_dismissals FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_resource_link_dismissals TO service_role;

CREATE POLICY account_resource_link_dismissals_select_account_member
  ON public.account_resource_link_dismissals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.account_id = account_resource_link_dismissals.account_id
        AND am.user_id = auth.uid()
        AND a.deletion_status = 'active'
    )
  );
