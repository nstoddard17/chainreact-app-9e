-- ChainReactV2 — account-scope the workflow_run_stats view
-- (Slice 4.ACCOUNT-SWITCHER-1).
--
-- The view was created in 4.WORKFLOWS-PAGE-1 grouping only by workflow_id, with a
-- (now-stale) comment claiming per-USER scoping. After the 4.ACCOUNT-MODEL-8
-- cutover, workflow_runs RLS is account-membership based
-- (workflow_runs_select_account_member), so the security_invoker view already
-- gates by account membership — NOT by user_id. This migration makes the scope
-- EXPLICIT + queryable by exposing account_id, so the dashboard can scope run
-- stats to the caller's ACTIVE account (not just "everything the user can see").
--
-- account_id is functionally dependent on workflow_id (every run of a workflow
-- carries that workflow's account_id), so grouping by (workflow_id, account_id)
-- changes no aggregate — it just surfaces the column for a WHERE filter.
--
-- CREATE OR REPLACE keeps the existing 5 output columns in order and appends
-- account_id, so dependent grants + readers are preserved. Still real-runs-only
-- (is_test = false). No table → the migration-RLS linter does not apply.

CREATE OR REPLACE VIEW public.workflow_run_stats
WITH (security_invoker = true) AS
SELECT
  r.workflow_id                                                        AS workflow_id,
  count(*)::bigint                                                     AS total,
  count(*) FILTER (WHERE r.status = 'succeeded')::bigint               AS succeeded,
  max(r.started_at)                                                    AS last_run_at,
  (array_agg(r.status ORDER BY r.started_at DESC))[1]                  AS last_run_status,
  r.account_id                                                         AS account_id
FROM public.workflow_runs r
WHERE r.is_test = false
GROUP BY r.workflow_id, r.account_id;

COMMENT ON VIEW public.workflow_run_stats IS
  'Lifetime per-workflow run aggregates (real runs only, is_test=false), keyed by '
  'workflow_id + account_id. security_invoker so workflow_runs RLS '
  '(account-membership) gates visibility; account_id lets callers scope to a '
  'specific (active) account.';

-- CREATE OR REPLACE preserves existing grants; re-assert for clarity / idempotency.
GRANT SELECT ON public.workflow_run_stats TO authenticated;
GRANT SELECT ON public.workflow_run_stats TO service_role;
