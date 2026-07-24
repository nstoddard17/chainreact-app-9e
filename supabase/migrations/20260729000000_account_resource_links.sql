-- 5.TRUCK-BRIDGE-1 CS-1 — account-owned resource links (vehicle mapping foundation).
--
-- Plan: docs/slices/phase-5/truck-bridge-vehicle-mapping-plan.md §4.1 + §6.
--
-- WHAT THIS IS: an explicit, human-confirmed correspondence between the SAME
-- physical asset in two different provider systems — first use case, a Motive
-- vehicle and its Fleetio counterpart. Neither provider returns the other's id
-- (verified in the plan §2.1), so this correspondence cannot be derived at
-- runtime; ChainReact must store it. Stored once per account, reusable by every
-- workflow in that account.
--
-- INERT ON ARRIVAL. CS-1 ships the table + repository only. No route, no UI, no
-- workflow action, no matching/suggestion logic reads or writes this table yet
-- (those are CS-2..CS-5). Nothing user-visible changes when this is applied.
--
-- ── What is deliberately NOT stored here ────────────────────────────────────
-- No tokens, no credentials, no integration row ids, no provider response
-- blobs, no VIN / plate / make / model / year, no workflow ids, and no
-- user-owned authorization column. The only vehicle metadata is the two
-- `*_label` DISPLAY SNAPSHOTS (see below). Widening this table to carry
-- provider secrets or authorization would break both the ownership rule and
-- the no-leak posture — do not.
--
-- ── Ownership (docs/rules/account-ownership-model.md) ───────────────────────
-- `account_id` is the SOLE ownership column. `created_by_user_id` and
-- `confirmed_by_user_id` are PROVENANCE ONLY — they answer "who set this up?"
-- for the audit requirement and MUST NEVER be consulted for authorization.
-- Any member of the owning account may create, confirm, and archive links
-- (a vehicle mapping is day-to-day fleet operations, not credential
-- management), so a creator-ownership check would be wrong as well as
-- redundant. Both columns are ON DELETE SET NULL: when a user leaves or is
-- deleted, the link stays with the ACCOUNT and only the provenance is lost.
--
-- ── DEFERRED LIMITATION — provider-account discriminator (be precise) ───────
-- This schema does NOT carry `source_provider_account_id` /
-- `target_provider_account_id`. It therefore identifies a target as
-- "Fleetio vehicle 42 for this ChainReact account" — NOT "Fleetio vehicle 42
-- in Fleetio account 7211". If one ChainReact account ever connects TWO
-- Fleetio accounts, the target-uniqueness index below cannot tell those two
-- vehicle 42s apart and would wrongly treat them as the same vehicle.
--
-- That is acceptable TODAY only because multiple provider accounts per
-- ChainReact account are already unsupported end-to-end: the Fleetio execution
-- seam resolves the account's SINGLE active row and defers node-level
-- multi-connection selection to a later slice (integrations/fleetio/execute.ts
-- header). This table must gain the discriminator columns IN THE SAME SLICE
-- that lifts that restriction. Do not claim multi-Fleetio-account support
-- before then.
--
-- ROLLBACK (pre-launch, table is inert and unreferenced):
--   DROP TABLE public.account_resource_links;

CREATE TABLE public.account_resource_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sole ownership column. CASCADE: a link has no meaning without its account.
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- Provider-neutral in SHAPE; 'vehicle' is the only accepted value in v1.
  -- Widening is a forward-only migration (drop + re-add the CHECK), not a
  -- redesign — every column above is already kind-agnostic.
  resource_kind text NOT NULL
    CONSTRAINT account_resource_links_resource_kind_known
    CHECK (resource_kind IN ('vehicle')),

  -- ── The telematics side: the id that arrives on a trigger/action output ───
  source_provider text NOT NULL
    CONSTRAINT account_resource_links_source_provider_bounded
    CHECK (btrim(source_provider) <> '' AND length(source_provider) <= 64),
  source_external_id text NOT NULL
    CONSTRAINT account_resource_links_source_external_id_bounded
    CHECK (btrim(source_external_id) <> '' AND length(source_external_id) <= 256),

  -- ── The system-of-record side: what a Fleetio write ultimately needs ──────
  target_provider text NOT NULL
    CONSTRAINT account_resource_links_target_provider_bounded
    CHECK (btrim(target_provider) <> '' AND length(target_provider) <= 64),
  target_external_id text NOT NULL
    CONSTRAINT account_resource_links_target_external_id_bounded
    CHECK (btrim(target_external_id) <> '' AND length(target_external_id) <= 256),

  -- Non-secret DISPLAY SNAPSHOTS ("Unit 104", "Truck 104") so the management
  -- screen and run-failure messages can NAME a vehicle without a live provider
  -- call — which matters most exactly when a provider is disconnected. These go
  -- stale by design and are surfaced as last-seen names, never as truth. They
  -- are the ONLY vehicle metadata this table stores.
  source_label text
    CONSTRAINT account_resource_links_source_label_bounded
    CHECK (source_label IS NULL OR length(source_label) <= 256),
  target_label text
    CONSTRAINT account_resource_links_target_label_bounded
    CHECK (target_label IS NULL OR length(target_label) <= 256),

  -- How this link came to exist. AUDIT/UX ONLY — never consulted at runtime.
  -- 'manual' = the user paired the two vehicles by hand; every 'suggested_*'
  -- value records which evidence tier the user was shown before they confirmed
  -- (plan §4.5). A suggestion is never written without an explicit human
  -- confirmation, so every row here is user-confirmed regardless of basis.
  match_basis text NOT NULL
    CONSTRAINT account_resource_links_match_basis_known
    CHECK (match_basis IN (
      'manual',
      'suggested_vin',
      'suggested_plate',
      'suggested_number',
      'suggested_name'
    )),

  -- ── Audit: who set this up. PROVENANCE ONLY, never authorization. ─────────
  created_by_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Required: every row in this table is a CONFIRMED link by definition. No
  -- DEFAULT — the writer must state when confirmation happened.
  confirmed_at timestamptz NOT NULL,

  -- Soft lifecycle: links are ARCHIVED, never hard-deleted, so a historical run
  -- that used a since-removed link can still be explained.
  archived_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A link must join two DISTINCT identities. Same provider + same id is a
  -- self-link and is meaningless. Two DIFFERENT providers that happen to issue
  -- the same id string stay legal (ids are opaque per-provider namespaces).
  CONSTRAINT account_resource_links_distinct_sides CHECK (
    source_provider <> target_provider OR source_external_id <> target_external_id
  )
);

-- ── Active-link uniqueness (both partial: archived rows never block) ────────
-- Scoping BOTH indexes by `source_provider` is deliberate. It keeps the
-- genuinely valid multi-telematics case legal —
--     Motive  vehicle A → Fleetio vehicle X
--     Samsara vehicle B → Fleetio vehicle X   (same truck, two telematics systems)
-- — while still blocking the incoherent case (two MOTIVE vehicles both claiming
-- Fleetio vehicle X). v1 ships only Motive; the index shape does not need to
-- change when a second telematics provider arrives.

-- One active target per source vehicle (per target provider).
CREATE UNIQUE INDEX account_resource_links_source_unique
  ON public.account_resource_links
     (account_id, resource_kind, source_provider, source_external_id, target_provider)
  WHERE archived_at IS NULL;

-- ...and the reverse: one active source per target vehicle, per source provider.
CREATE UNIQUE INDEX account_resource_links_target_unique
  ON public.account_resource_links
     (account_id, resource_kind, source_provider, target_provider, target_external_id)
  WHERE archived_at IS NULL;

-- Listing a management screen's links, newest first.
CREATE INDEX account_resource_links_account_idx
  ON public.account_resource_links (account_id, resource_kind, created_at DESC);

CREATE TRIGGER account_resource_links_set_updated_at
  BEFORE UPDATE ON public.account_resource_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS + GRANTs ────────────────────────────────────────────────────────────
-- Posture: SERVICE-ROLE ONLY at the Data API layer. CS-1 ships no route and no
-- UI, so nothing authenticated has any reason to touch this table directly;
-- every access goes through repositories/accountResourceLinks.ts, which forces
-- an account_id predicate on every read and write.
--
-- BE PRECISE ABOUT WHAT PROTECTS WHAT (this matters, and is easy to get wrong):
--   * The service role BYPASSES RLS. These policies do NOT constrain the
--     repository. The repository's mandatory `account_id` predicates ARE the
--     runtime tenant boundary for every service-role call — that is why they are
--     structural in the repository and covered by cross-account tests.
--   * The RLS policy below constrains AUTHENTICATED/ANON direct Data API access.
--     Today that access is additionally revoked outright (below), so the policy
--     is defense-in-depth: it is what keeps this table safe if a future slice
--     ever grants `authenticated` a direct SELECT.
--   * Writes have NO policy at all. RLS denies any command with no matching
--     policy, so even a future authenticated grant could not INSERT/UPDATE.

ALTER TABLE public.account_resource_links ENABLE ROW LEVEL SECURITY;

-- MANDATORY REVOKE FIRST (see 20260725000000): this project carries
-- `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated,
-- service_role`, so a newly created table in `public` arrives with FULL
-- privileges for anon + authenticated no matter what this migration grants.
-- Granting narrowly does NOT end up narrow — the surplus must be revoked
-- explicitly, or `authenticated` silently keeps SELECT/INSERT/UPDATE/DELETE and
-- the service-role-only contract above is fiction.
REVOKE ALL ON public.account_resource_links FROM anon;
REVOKE ALL ON public.account_resource_links FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_resource_links TO service_role;

-- Defense-in-depth read scope: a link is visible only to a current member of the
-- owning account, and only while that account is active (freeze-aware, matching
-- the account-deletion lifecycle predicate used across the account tables).
CREATE POLICY account_resource_links_select_account_member
  ON public.account_resource_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.account_id = account_resource_links.account_id
        AND am.user_id = auth.uid()
        AND a.deletion_status = 'active'
    )
  );
