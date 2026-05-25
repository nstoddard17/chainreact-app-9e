-- ChainReactV2 — task_usage_events ledger + workflow_runs cost columns (Slice 4.COST-3).
--
-- COST-3 is "ledger-only first" (audit §5 Option A): live billing stays the
-- flat 1-task-per-run pre-deduct (Slice 1N) with the COST-2A test-mode skip.
-- This migration adds the append-only ledger + per-run cost columns so the
-- engine can RECORD actuals + the COST-2 estimate alongside the existing
-- charge — establishing historical auditability and the foundation for a
-- future reserve/reconcile model. Nothing here deducts tasks.
--
-- See docs/slices/phase-4/task-cost-billing-model-audit.md (COST-3 note).

-- ── Append-only task usage ledger ────────────────────────────────────────────
--
-- One row per accounting event. Today the engine writes two event types per
-- real run: `run_estimate_recorded` (the COST-2 estimate) and one
-- `node_task_charged` per successful billable action node. The remaining
-- event types are reserved for the future reserve/reconcile + polling layers.
-- AI cost events are a SEPARATE ledger (not modeled here).
--
-- No raw config / secrets / tokens / payloads ever land here — the recorder
-- only writes node identity (id/provider/type/kind), policy classification,
-- task counts, and a redacted numeric summary in `metadata`.

CREATE TABLE public.task_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Nullable + SET NULL: a usage event outlives a deleted workflow for
  -- historical cost auditing (the workflow_run_id cascade still reclaims
  -- run-scoped rows when the run itself is deleted).
  workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL,
  -- Nullable: future non-run events (e.g. internal_poll_cost_recorded) have
  -- no run. Run-scoped events cascade-delete with their run.
  workflow_run_id uuid REFERENCES public.workflow_runs(id) ON DELETE CASCADE,

  node_id text,
  provider text,
  node_type text,
  node_kind text,

  event_type text NOT NULL,
  billable boolean NOT NULL DEFAULT false,
  tasks_charged integer NOT NULL DEFAULT 0,
  estimated_tasks integer,
  actual_tasks integer,
  charge_on text,
  cost_reason text,
  cost_policy_version text NOT NULL,
  test_mode boolean NOT NULL DEFAULT false,

  -- Redacted, numeric-only summary (counts / flags). NEVER node config.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT task_usage_events_event_type_chk CHECK (event_type IN (
    'node_task_charged',
    'run_estimate_recorded',
    'billing_reserved',
    'billing_reconciled',
    'billing_refunded',
    'internal_poll_cost_recorded'
  ))
);

-- "List/aggregate the usage events for this run" — the dominant access path.
CREATE INDEX task_usage_events_run_idx
  ON public.task_usage_events (workflow_run_id);

-- "Usage for this user over time" — future owner/admin analytics.
CREATE INDEX task_usage_events_user_idx
  ON public.task_usage_events (user_id, created_at DESC);

-- "Usage for this workflow over time" — expensive-workflow analytics.
CREATE INDEX task_usage_events_workflow_idx
  ON public.task_usage_events (workflow_id, created_at DESC);

ALTER TABLE public.task_usage_events ENABLE ROW LEVEL SECURITY;

-- Reads: users see their own usage events only (future analytics surfaces).
-- Writes come exclusively from the engine via the service-role client
-- (background execution, no user session). No user-facing write policies —
-- default-deny so a user cannot fabricate / erase their own usage ledger.
CREATE POLICY task_usage_events_select_own ON public.task_usage_events
  FOR SELECT USING (auth.uid() = user_id);

-- Explicit Data API grants (least privilege). authenticated may only SELECT
-- (RLS narrows to own rows); the service-role owns all writes.
GRANT SELECT ON public.task_usage_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_usage_events TO service_role;

-- ── Per-run cost columns on workflow_runs ────────────────────────────────────
--
-- Denormalized O(1) per-run cost (vs aggregating the ledger). All nullable:
-- populated by the engine for real runs only; test runs + pre-COST-3 rows +
-- fatal-before-execution runs leave them NULL. `task_cost_policy_version`
-- pins the policy a run was costed under for historical accuracy.
-- workflow_runs is grandfathered (existing table) — no new GRANTs needed.

ALTER TABLE public.workflow_runs
  ADD COLUMN estimated_task_cost integer,
  ADD COLUMN actual_task_cost integer,
  ADD COLUMN task_cost_policy_version text;
