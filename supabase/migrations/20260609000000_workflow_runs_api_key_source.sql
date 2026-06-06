-- ChainReactV2 — API-key run provenance on workflow_runs
-- (Slice 4.API-KEYS-RUN-HISTORY-2 / RH-1).
--
-- Additive, null-safe SCHEMA ONLY. Lets a run later be marked as
-- public-API-key-triggered without changing any behavior yet: FK-4's public trigger
-- route still enqueues `triggered_by = 'manual'` until RH-2 threads the provenance.
--
-- Changes:
--   1. Expand the workflow_runs_triggered_by_chk CHECK to allow 'api_key'
--      (drop + recreate with the expanded set — the documented expansion path from
--      20260523000000_workflow_runs_test_mode.sql).
--   2. Add nullable `triggered_by_api_key_id` — FK to account_api_keys(id),
--      ON DELETE SET NULL so deleting a key never blocks or cascades run-history rows.
--   3. Add nullable `triggered_by_api_key_prefix` — a NON-SECRET display snapshot of
--      the key's prefix (e.g. 'crk_live_AbCd1234'), so attribution survives the key
--      being revoked/renamed/deleted. The raw key and key_hash are NEVER stored here.
--
-- Existing rows + all existing triggered_by values (manual/test/webhook/scheduled/
-- retry/unknown) remain valid; the new columns default NULL. No backfill. No RLS
-- change — workflow_runs already enforces RLS and the additive columns inherit it.
--
-- ROLLBACK:
--   ALTER TABLE public.workflow_runs DROP COLUMN triggered_by_api_key_prefix;
--   ALTER TABLE public.workflow_runs DROP COLUMN triggered_by_api_key_id;
--   ALTER TABLE public.workflow_runs DROP CONSTRAINT workflow_runs_triggered_by_chk;
--   ALTER TABLE public.workflow_runs ADD CONSTRAINT workflow_runs_triggered_by_chk
--     CHECK (triggered_by IN ('manual','test','webhook','scheduled','retry','unknown'));

ALTER TABLE public.workflow_runs
  DROP CONSTRAINT workflow_runs_triggered_by_chk;

ALTER TABLE public.workflow_runs
  ADD CONSTRAINT workflow_runs_triggered_by_chk
  CHECK (triggered_by IN (
    'manual',
    'test',
    'webhook',
    'scheduled',
    'retry',
    'api_key',
    'unknown'
  ));

ALTER TABLE public.workflow_runs
  ADD COLUMN triggered_by_api_key_id uuid
    REFERENCES public.account_api_keys(id) ON DELETE SET NULL,
  ADD COLUMN triggered_by_api_key_prefix text;
