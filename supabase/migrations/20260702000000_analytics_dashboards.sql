-- ChainReactV2 — Analytics dashboards foundation (Slice ANALYTICS-1).
--
-- Backs the customizable Analytics page (/analytics): account-scoped, saved
-- dashboards each holding an ordered set of widgets. The page lets a member mix
-- and match widgets (stat tiles, charts, activity feed, notes) over their
-- account's real run/workflow/integration data.
--
-- DATA MODEL — one table, widgets stored as a JSONB array on the dashboard row.
-- The product model is "nothing is saved until you click Done editing": the
-- client edits a whole dashboard locally and saves the entire widget layout in
-- one atomic write. A JSONB array fits that exactly and avoids a second table +
-- per-widget id lifecycle. The `widgets` array shape is validated by Zod
-- (contracts/analytics.ts) on every write — the DB only stores already-validated,
-- structural widget config (type / size / title / icon / data-source / metric /
-- filters). NO credentials, tokens, provider labels/emails, or run payloads are
-- ever stored here: widgets reference data by metric id + optional workflow id,
-- and the live values are computed at read time by services/analytics/* from the
-- account's own run/workflow/integration data. So this table is structurally
-- credential-free, like workflow_templates.
--
-- ACCOUNT-SCOPED — account_id is the authority root (same as workflows /
-- templates / runs). A dashboard belongs to an account; every member of that
-- account may see and manage it (analytics is a shared, account-level view, like
-- folders are account-scoped organization). There is no per-user ownership or
-- cross-account sharing in this slice; created_by_user_id is provenance only,
-- NOT authorization.
--
-- snapshot columns (snapshot, snapshot_at, next_refresh_at) are reserved for the
-- future per-widget refresh-schedule scheduler (ANALYTICS-2, deferred). They are
-- unused by this slice — widget data is computed live on load — and ship now only
-- so the scheduler lands without another structural migration. Nothing reads or
-- writes them yet.
--
-- ROLLBACK (pre-launch, no prod data): DROP TABLE public.analytics_dashboards.
-- Nothing references it.

CREATE TABLE public.analytics_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owning account — the authority root. ON DELETE CASCADE: a dashboard has no
  -- meaning without its account.
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- Who created the dashboard. Provenance only — NOT authorization (any account
  -- member may manage it). SET NULL if that user is later deleted; the dashboard
  -- survives as an account asset.
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Human label shown on the saved-dashboard tab, e.g. 'Overview'.
  name text NOT NULL,

  -- Tab order within the account (ascending). Ties broken by created_at.
  position integer NOT NULL DEFAULT 0,

  -- The auto-seeded "Overview" dashboard for an account. At most one per account
  -- in practice (seeded once); not DB-enforced because it's a soft default, not
  -- an invariant the app depends on.
  is_default boolean NOT NULL DEFAULT false,

  -- Ordered widget layout. Each element is a structural widget descriptor
  -- (id / type / size / title / icon / config) validated by Zod on write. NEVER
  -- credentials or live values — see the module header. Defaults to an empty
  -- board.
  widgets jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Reserved for ANALYTICS-2 refresh scheduler (deferred; unused this slice).
  snapshot jsonb,
  snapshot_at timestamptz,
  next_refresh_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- List an account's dashboards in tab order.
CREATE INDEX analytics_dashboards_account_position_idx
  ON public.analytics_dashboards (account_id, position, created_at);

-- Author provenance lookups.
CREATE INDEX analytics_dashboards_created_by_idx
  ON public.analytics_dashboards (created_by_user_id);

CREATE TRIGGER analytics_dashboards_set_updated_at
  BEFORE UPDATE ON public.analytics_dashboards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
--
-- Reads: account MEMBERS may SELECT their account's dashboards (gated by an
-- active, non-frozen membership); non-members + anon see nothing (no existence
-- oracle). Mirrors workflow_templates_select_account_member.
--
-- Writes: SERVICE-ROLE ONLY. There is NO authenticated INSERT/UPDATE/DELETE
-- policy and NO authenticated write GRANT — all writes go through the
-- service-role repository AFTER the route authorizes the caller as a member of
-- the dashboard's account (mirrors the workflow_templates create-path gate).

ALTER TABLE public.analytics_dashboards ENABLE ROW LEVEL SECURITY;

-- Data API access (explicit GRANTs required after Supabase removes implicit
-- grants on public tables, Oct 30 2026). authenticated may READ (membership-gated
-- by the policy); service_role owns all access. authenticated gets NO write grant.
GRANT SELECT ON public.analytics_dashboards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_dashboards TO service_role;

CREATE POLICY analytics_dashboards_select_account_member
  ON public.analytics_dashboards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.account_id = analytics_dashboards.account_id
        AND am.user_id = auth.uid()
        AND a.deletion_status = 'active'
    )
  );
