-- Add more missing columns to trigger_resources and webhook_events tables
-- These columns are required by the code but may be missing from the schema

-- Add external_id column to trigger_resources if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_resources' AND column_name = 'external_id'
  ) THEN
    ALTER TABLE trigger_resources ADD COLUMN external_id TEXT;
  END IF;
END $$;

-- Add provider column to webhook_events if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_events' AND column_name = 'provider'
  ) THEN
    ALTER TABLE webhook_events ADD COLUMN provider TEXT;
  END IF;
END $$;

-- Add service column to webhook_events if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_events' AND column_name = 'service'
  ) THEN
    ALTER TABLE webhook_events ADD COLUMN service TEXT;
  END IF;
END $$;

-- Add request_id column to webhook_events if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_events' AND column_name = 'request_id'
  ) THEN
    ALTER TABLE webhook_events ADD COLUMN request_id TEXT;
  END IF;
END $$;

-- Add status column to webhook_events if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_events' AND column_name = 'status'
  ) THEN
    ALTER TABLE webhook_events ADD COLUMN status TEXT;
  END IF;
END $$;

-- Add timestamp column to webhook_events if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_events' AND column_name = 'timestamp'
  ) THEN
    ALTER TABLE webhook_events ADD COLUMN timestamp TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_trigger_resources_external_id ON trigger_resources (external_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events (provider);
CREATE INDEX IF NOT EXISTS idx_webhook_events_request_id ON webhook_events (request_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events (status);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
