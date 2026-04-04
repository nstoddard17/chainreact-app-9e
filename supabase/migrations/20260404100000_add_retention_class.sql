-- Migration: Add retention_class to workflow_execution_sessions
-- Purpose: Enable tier-based data retention cleanup.
-- retention_class is stamped at execution creation time to preserve
-- the tier the user was on when the execution ran.

-- Step 1: Add column with default (safe, instant on Postgres 11+)
ALTER TABLE workflow_execution_sessions
  ADD COLUMN IF NOT EXISTS retention_class TEXT NOT NULL DEFAULT 'free';

-- Step 2: Best-effort backfill from current entitlement (legacy approximation).
-- Users may have changed tiers since execution time.
UPDATE workflow_execution_sessions wes
SET retention_class = COALESCE(
  (SELECT ue.tier_code FROM user_entitlements ue WHERE ue.user_id = wes.user_id LIMIT 1),
  'free'
)
WHERE retention_class = 'free';

-- Step 3: Add check constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_retention_class'
  ) THEN
    ALTER TABLE workflow_execution_sessions
      ADD CONSTRAINT chk_retention_class CHECK (retention_class IN ('free', 'pro', 'team'));
  END IF;
END $$;

-- Step 4: Index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_wes_retention_started
  ON workflow_execution_sessions(retention_class, started_at);
