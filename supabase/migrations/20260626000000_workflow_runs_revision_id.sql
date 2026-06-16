-- ChainReactV2 — executed-revision attribution on workflow_runs (V2-READY-41I).
--
-- Active-revision execution went live as the real product model in V2-READY-41H:
-- a live run executes the workflow's immutable active revision (with a safe draft
-- fallback for legacy / pre-41C / dangling-pointer workflows). Run history could
-- not say WHICH revision executed. This records it.
--
-- Additive, null-safe SCHEMA ONLY. No behavior change in this migration — the
-- engine threads the resolved revision id in the same slice.
--
-- Changes:
--   1. Add nullable `revision_id` — FK to workflow_revisions(id), ON DELETE SET
--      NULL so deleting a revision never blocks or cascades run-history rows
--      (mirrors the triggered_by_api_key_id precedent in
--      20260609000000_workflow_runs_api_key_source.sql, and the
--      workflows.active_revision_id FK in 20260506000000_workflows.sql).
--   2. Partial index on revision_id (non-null) — supports "which runs executed
--      this revision?" debugging lookups and keeps the FK SET-NULL scan cheap.
--
-- Semantics of the column (written by the engine):
--   - live run + active revision present → that revision's id.
--   - draft / test / preview run         → NULL (ran the mutable draft).
--   - legacy active workflow, null        → NULL (safe draft fallback).
--   - dangling active_revision_id         → NULL (safe draft fallback).
--
-- Existing rows default NULL. No backfill (a historical run's executed definition
-- is not reconstructable; NULL == "unattributed", same as legacy/fallback). No
-- RLS change — workflow_runs already enforces RLS and the additive column
-- inherits it. revision_id is NOT exposed by any run display/detail projection —
-- it is an internal attribution pointer, never a definition payload.
--
-- Retention/purge: account purge deletes workflow_runs explicitly before the
-- account; workflow_revisions cascade-delete via the workflow row. ON DELETE SET
-- NULL means a revision delete never blocks a run-history row. No conflict.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.workflow_runs_revision_idx;
--   ALTER TABLE public.workflow_runs DROP COLUMN revision_id;

ALTER TABLE public.workflow_runs
  ADD COLUMN revision_id uuid
    REFERENCES public.workflow_revisions(id) ON DELETE SET NULL;

CREATE INDEX workflow_runs_revision_idx
  ON public.workflow_runs (revision_id)
  WHERE revision_id IS NOT NULL;
