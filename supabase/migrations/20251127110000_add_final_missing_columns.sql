-- Add final missing columns to trigger_resources and webhook_events tables

-- Add node_id column to trigger_resources if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_resources' AND column_name = 'node_id'
  ) THEN
    ALTER TABLE trigger_resources ADD COLUMN node_id TEXT;
  END IF;
END $$;

-- Add trigger_type column to trigger_resources if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_resources' AND column_name = 'trigger_type'
  ) THEN
    ALTER TABLE trigger_resources ADD COLUMN trigger_type TEXT;
  END IF;
END $$;

-- Add resource_type column to trigger_resources if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_resources' AND column_name = 'resource_type'
  ) THEN
    ALTER TABLE trigger_resources ADD COLUMN resource_type TEXT;
  END IF;
END $$;

-- Add provider_id column to trigger_resources if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_resources' AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE trigger_resources ADD COLUMN provider_id TEXT;
  END IF;
END $$;

-- Add expires_at column to trigger_resources if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_resources' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE trigger_resources ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- For webhook_events, the event_type column has NOT NULL constraint
-- First check if it exists, if not add it with a default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_events' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE webhook_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'unknown';
  ELSE
    -- If it exists but has NOT NULL, make sure there's a default or allow NULL temporarily
    ALTER TABLE webhook_events ALTER COLUMN event_type DROP NOT NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Column might already exist with the constraint, that's ok
  NULL;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_trigger_resources_node_id ON trigger_resources (node_id);
CREATE INDEX IF NOT EXISTS idx_trigger_resources_provider_id ON trigger_resources (provider_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON webhook_events (event_type);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
