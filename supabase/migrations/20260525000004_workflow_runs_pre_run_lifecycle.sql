-- ChainReactV2 — workflow_runs pre-run lifecycle support (Slice 4.COST-15B).
--
-- Enables creating a workflow_runs row at the START of execution (status
-- 'running', finished_at NULL) and finalizing it by UPDATE — the prerequisite
-- for live reserve/reconcile billing (COST-15D), which must attach a
-- reservation to a DURABLE run row BEFORE any billable side effect. The
-- COST-12 RPCs key on workflow_runs.id and return 'run_not_found' when the row
-- is absent. See docs/slices/phase-4/pre-run-workflow-run-lifecycle-design.md
-- (COST-15A).
--
-- SCHEMA/DATA ONLY — no engine wiring (that is COST-15C), no live-billing
-- change. No billing columns are added (COST-12 already added
-- reserved_task_cost / reconciled_task_cost / billing_status / reservation_id /
-- reservation_expires_at / billing_reconciled_at). No backfill: existing
-- terminal rows (status succeeded/failed, finished_at set, billing_status NULL)
-- remain valid, unchanged.
--
-- system-table: workflow_runs — pre-existing table; this migration only ALTERs
--   it (adds an enum value + relaxes a NOT NULL). RLS + the owner SELECT policy
--   were established in 20260507000001_workflow_runs.sql and are unchanged.

-- 1) Add a non-terminal 'running' value to the run-status enum.
--
--    Safe inside a transaction on PG12+ because this migration only ADDS the
--    value; nothing here USES it (the engine starts writing 'running' in
--    COST-15C — a later deploy — so the "a new enum value cannot be used in the
--    same transaction that adds it" rule does not apply here). IF NOT EXISTS
--    makes re-application a no-op. The existing partial index
--    `workflow_runs_failed_idx` (WHERE status = 'failed') is unaffected.
ALTER TYPE public.workflow_run_status ADD VALUE IF NOT EXISTS 'running';

-- 2) Allow a pre-run row to exist before it finishes. finalize sets it.
--    Existing rows already have a non-null finished_at, so this is backward
--    compatible (a nullable column accepts every existing value).
ALTER TABLE public.workflow_runs
  ALTER COLUMN finished_at DROP NOT NULL;
