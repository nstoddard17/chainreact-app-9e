-- ChainReactV2 — billing_shadow_comparisons: persisted reserve/reconcile SHADOW ledger (Slice 4.COST-14C).
--
-- A SEPARATE append-only table for HYPOTHETICAL billing comparisons produced by
-- COST-14 shadow mode (what reserve/reconcile WOULD have billed vs the flat
-- charge). It exists so the COST-14B aggregator has a durable in-app source for
-- the COST-15 cutover decision — COST-14 only emits stdout logs.
--
-- This is NOT actual billing. It must stay OUT of task_usage_events /
-- ai_cost_events (the actual ledgers) so real billing analytics are never
-- polluted by hypothetical numbers. Nothing here mutates a balance.
--
-- Written by the engine ONLY when ENABLE_RESERVE_RECONCILE_SHADOW is on, one
-- row per real run (test/dry-run runs write nothing). Persistence is fail-open.
--
-- HARD redaction: only ids, counts, booleans, warning CODES, policy version,
-- and timestamps. NEVER node config, tokens, secrets, provider payloads,
-- message bodies, file contents, raw definitions, or raw warning messages.
--
-- See docs/slices/phase-4/reserve-reconcile-billing-design.md (COST-14C note).

CREATE TABLE public.billing_shadow_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Correlation keys only (NO FK): shadow rows are decoupled analysis data and
  -- must persist regardless of run/workflow-row write success (the engine's
  -- run-row write is itself fail-open). User-cascade handles the common cleanup;
  -- a future retention sweep can prune older rows if needed.
  workflow_id uuid NOT NULL,
  workflow_run_id uuid NOT NULL,

  flat_charged_tasks int NOT NULL,
  estimated_tasks_per_run int NOT NULL,
  actual_billable_tasks int NOT NULL,
  proposed_reserved_tasks int NOT NULL,
  proposed_reconciled_tasks int NOT NULL,
  proposed_refunded_tasks int NOT NULL,
  delta_vs_flat int NOT NULL,

  would_have_reserved boolean NOT NULL,
  -- Nullable: null when the run had no billing summary to compare against.
  would_have_had_enough_balance boolean,

  -- Warning CODES only (never messages). The estimator's codes are a closed set.
  warning_codes text[] NOT NULL DEFAULT '{}',
  policy_version text NOT NULL,

  billing_mode text NOT NULL DEFAULT 'shadow',
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT billing_shadow_comparisons_mode_chk CHECK (billing_mode = 'shadow')
);

-- One shadow comparison per run (idempotency anchor for the engine's
-- fail-open insert). workflow_run_id is NOT NULL so a plain UNIQUE suffices.
CREATE UNIQUE INDEX billing_shadow_comparisons_run_uniq
  ON public.billing_shadow_comparisons (workflow_run_id);

-- "Shadow rows for this user over time" + per-workflow + time-range scans for
-- the aggregator. Plus a delta index (largest movers) and a partial index on
-- the insufficient-balance case (recurring-affected workflows).
CREATE INDEX billing_shadow_comparisons_user_idx
  ON public.billing_shadow_comparisons (user_id, created_at DESC);
CREATE INDEX billing_shadow_comparisons_workflow_idx
  ON public.billing_shadow_comparisons (workflow_id, created_at DESC);
CREATE INDEX billing_shadow_comparisons_created_idx
  ON public.billing_shadow_comparisons (created_at DESC);
CREATE INDEX billing_shadow_comparisons_delta_idx
  ON public.billing_shadow_comparisons (delta_vs_flat);
CREATE INDEX billing_shadow_comparisons_insufficient_idx
  ON public.billing_shadow_comparisons (created_at DESC)
  WHERE would_have_had_enough_balance = false;

ALTER TABLE public.billing_shadow_comparisons ENABLE ROW LEVEL SECURITY;

-- Reads: a user may see their OWN shadow rows (future surfaces). Owner/admin
-- analytics + all writes go through the service-role client. No user-facing
-- write policies — default-deny so a user cannot fabricate/erase shadow data.
CREATE POLICY billing_shadow_comparisons_select_own ON public.billing_shadow_comparisons
  FOR SELECT USING (auth.uid() = user_id);

-- Explicit Data API grants (least privilege). authenticated may only SELECT
-- (RLS narrows to own rows); service_role owns writes + cross-user owner reads.
GRANT SELECT ON public.billing_shadow_comparisons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_shadow_comparisons TO service_role;
