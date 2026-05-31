-- ChainReactV2 — account_deletions.purge_counts (Slice 4.ACCOUNT-MODEL-10c).
--
-- Additive: records the teardown tally (integrations revoked/deleted, workflows,
-- runs, billing/account/auth flags) on the durable deletion-audit row when a
-- purge completes. Stores NO user content — integer counts + booleans only.
--
-- No new table → the migration-RLS lint (CREATE TABLE only) does not apply.
-- account_deletions already has RLS + the subject-select policy from 10b.
-- Idempotent.

ALTER TABLE public.account_deletions
  ADD COLUMN IF NOT EXISTS purge_counts jsonb;
