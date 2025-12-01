-- Add test webhook isolation columns to trigger_resources
-- This enables separate test vs production webhook subscriptions

-- Add is_test column to distinguish test subscriptions from production
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_resources' AND column_name = 'is_test'
  ) THEN
    ALTER TABLE trigger_resources ADD COLUMN is_test BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add test_session_id to link test subscriptions to their test session
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_resources' AND column_name = 'test_session_id'
  ) THEN
    ALTER TABLE trigger_resources ADD COLUMN test_session_id TEXT;
  END IF;
END $$;

-- Create index for efficient test resource lookups
CREATE INDEX IF NOT EXISTS idx_trigger_resources_is_test
  ON trigger_resources (is_test) WHERE is_test = true;

CREATE INDEX IF NOT EXISTS idx_trigger_resources_test_session
  ON trigger_resources (test_session_id) WHERE test_session_id IS NOT NULL;

-- Add comment explaining the isolation strategy
COMMENT ON COLUMN trigger_resources.is_test IS
  'True if this is a test subscription. Test subscriptions use separate webhook URLs and should not trigger production workflows.';

COMMENT ON COLUMN trigger_resources.test_session_id IS
  'Links to workflow_test_sessions.id for test subscriptions. Used to route webhook events to the correct test session.';
