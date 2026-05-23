-- ChainReactV2 — Slice 3.SEC-2: test-mode + provenance columns on workflow_runs.
--
-- `is_test` flags runs the engine executed in test mode (handlers for risky
-- external actions are short-circuited; no real provider calls). The engine
-- writes false when the row represents a real provider execution.
--
-- `triggered_by` records HOW the run was started — independent of test/real
-- mode. Lets post-mortems answer "which run-now / webhook / cron / retry
-- fired this?" without inferring from trigger_event.eventType.
--
-- Both columns default-safe: existing rows are treated as real (is_test=false)
-- runs of unknown provenance (triggered_by='unknown'). Engine writes ALWAYS
-- supply both columns going forward — the defaults exist purely to keep
-- backfill of in-flight runs cheap.

ALTER TABLE public.workflow_runs
  ADD COLUMN is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN triggered_by text NOT NULL DEFAULT 'unknown';

-- Constrained value set. Adding new sources (e.g. 'replay', 'admin') is a
-- migration that drops + recreates this constraint with the expanded set.
ALTER TABLE public.workflow_runs
  ADD CONSTRAINT workflow_runs_triggered_by_chk
  CHECK (triggered_by IN (
    'manual',
    'test',
    'webhook',
    'scheduled',
    'retry',
    'unknown'
  ));

-- Partial index for "list test runs for this workflow" — the dominant
-- builder-side query once the test-run history UI lands.
CREATE INDEX workflow_runs_test_idx
  ON public.workflow_runs (workflow_id, started_at DESC)
  WHERE is_test = true;
