-- ChainReactV2 — Slice 4.WORKFLOWS-PAGE-1: workflow_run_stats view.
--
-- Lifetime per-workflow run aggregates for the workflows list/dashboard page,
-- computed in ONE query (no client N+1, no unbounded in-memory scan).
--
-- Counts REAL runs only (is_test = false) — test-mode runs never count toward
-- the user-facing "Ran N times · X% successful" figure.
--
-- SECURITY: this is a `security_invoker` view, so it executes with the
-- privileges + RLS of the QUERYING user, not the view owner. The underlying
-- `workflow_runs` RLS policy (`auth.uid() = user_id`) therefore still applies
-- row-by-row — a user can only ever aggregate their OWN runs through this
-- view. There is no SECURITY DEFINER escalation and no cross-user exposure.
-- (Postgres 15+ honors security_invoker; the project's Supabase is 15+.)
--
-- Not a table → the migration-RLS linter (CREATE TABLE only) does not apply.
-- We still GRANT SELECT explicitly per the Data-API exposure rule so PostgREST
-- / supabase-js can read it after the Oct-2026 implicit-exposure cutover.

CREATE VIEW public.workflow_run_stats
WITH (security_invoker = true) AS
SELECT
  r.workflow_id                                                        AS workflow_id,
  count(*)::bigint                                                     AS total,
  count(*) FILTER (WHERE r.status = 'succeeded')::bigint               AS succeeded,
  max(r.started_at)                                                    AS last_run_at,
  (array_agg(r.status ORDER BY r.started_at DESC))[1]                  AS last_run_status
FROM public.workflow_runs r
WHERE r.is_test = false
GROUP BY r.workflow_id;

COMMENT ON VIEW public.workflow_run_stats IS
  'Lifetime per-workflow run aggregates (real runs only, is_test=false). '
  'security_invoker so workflow_runs RLS gates per-user access.';

-- Data API access (required after Oct 30, 2026). RLS on workflow_runs still
-- gates row visibility; this grant only lets the role TOUCH the view.
GRANT SELECT ON public.workflow_run_stats TO authenticated;
GRANT SELECT ON public.workflow_run_stats TO service_role;
