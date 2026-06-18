-- ChainReactV2 — Analytics dashboards finalize (Slice ANALYTICS-1 closeout).
--
-- Two corrections from the completion audit:
--
-- 1. Drop the reserved-but-unused refresh-scheduler columns. The per-widget
--    refresh scheduler is a separate, security-/infra-reviewed slice; shipping
--    speculative columns now leaves unused product surface. Re-add them in that
--    slice when they're actually wired. Forward-only (the create migration
--    20260702000000 stays untouched; this is the additive correction). No code
--    references these columns, so the drop is behavior-neutral.
--
-- 2. Enforce ONE default ("Overview") dashboard per account at the DB level.
--    The seed path (services/analytics/dashboards.listOrSeedDashboards) inserts
--    the default on first access; two concurrent first loads could otherwise
--    create duplicate defaults. This partial unique index makes the second insert
--    fail with 23505, which the seed now treats as "lost the race" and re-lists.

ALTER TABLE public.analytics_dashboards DROP COLUMN IF EXISTS snapshot;
ALTER TABLE public.analytics_dashboards DROP COLUMN IF EXISTS snapshot_at;
ALTER TABLE public.analytics_dashboards DROP COLUMN IF EXISTS next_refresh_at;

-- Collapse any pre-existing duplicate defaults (auto-seed race observed in dev)
-- to a single default per account BEFORE enforcing the unique index: keep the
-- oldest is_default row, demote the rest to ordinary (non-default) dashboards so
-- no data is lost. No-op in environments with ≤1 default per account.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY account_id ORDER BY created_at, id) AS rn
  FROM public.analytics_dashboards
  WHERE is_default
)
UPDATE public.analytics_dashboards d
SET is_default = false
FROM ranked
WHERE d.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS analytics_dashboards_one_default_per_account
  ON public.analytics_dashboards (account_id)
  WHERE is_default;
