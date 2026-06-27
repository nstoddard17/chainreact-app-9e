-- ChainReactV2 — durable run queue (Slice 6.DURABLE-QUEUE-1).
--
-- Replaces the interim in-process "fire-and-forget + after()/waitUntil" run
-- dispatch with a DURABLE, DB-backed queue. enqueueRun now persists a run row in
-- the new non-terminal 'queued' state BEFORE returning; a processor (cron +
-- best-effort inline drain) atomically transitions queued -> running and
-- executes it. A queued run survives a serverless/request termination because it
-- is a committed row, not an in-flight promise.
--
-- WHY workflow_runs (not a new queue table): the run's trigger_event already
-- lives on workflow_runs (its designed, RLS-scoped, account-owned home). Adding a
-- separate queue table would copy that raw provider payload into a second
-- surface — exactly what the durable-queue safety rule forbids. The queue is
-- therefore a STATE on the existing run row (queued -> running -> terminal), plus
-- a status-guarded claim UPDATE in the repository (single-winner; no double
-- execution). No new table, no RLS/GRANT change.
--
-- system-table: workflow_runs — pre-existing table; this migration only ALTERs it
--   (adds an enum value + a btree index). RLS + the owner SELECT policy were
--   established in 20260507000001_workflow_runs.sql and are unchanged.

-- 1) Add the non-terminal 'queued' value to the run-status enum.
--
--    Safe inside this migration's transaction on PG12+ because nothing HERE uses
--    the value (the index below intentionally does NOT reference the 'queued'
--    literal — see note 2). The engine/repository start writing/reading 'queued'
--    in a later deploy, so the "a new enum value cannot be used in the same
--    transaction that adds it" rule does not apply. IF NOT EXISTS makes
--    re-application a no-op.
ALTER TYPE public.workflow_run_status ADD VALUE IF NOT EXISTS 'queued';

-- 2) Index so the queue processor cheaply finds the oldest queued runs
--    (`WHERE status='queued' ORDER BY created_at`). A COMPOSITE (status,
--    created_at) btree — deliberately NOT a partial `WHERE status='queued'`
--    index, which would reference the brand-new enum value in the same
--    transaction that added it (forbidden by Postgres). Indexing the column
--    whose type just gained a value is allowed.
CREATE INDEX IF NOT EXISTS workflow_runs_queued_idx
  ON public.workflow_runs (status, created_at);
