-- Add missing columns to workflows table
-- The nodes and connections columns are needed for storing workflow structure

-- Add nodes column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflows' AND column_name = 'nodes'
  ) THEN
    ALTER TABLE workflows ADD COLUMN nodes JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add connections column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflows' AND column_name = 'connections'
  ) THEN
    ALTER TABLE workflows ADD COLUMN connections JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add config column to trigger_resources if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trigger_resources' AND column_name = 'config'
  ) THEN
    ALTER TABLE trigger_resources ADD COLUMN config JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add event_data column to webhook_events if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_events' AND column_name = 'event_data'
  ) THEN
    ALTER TABLE webhook_events ADD COLUMN event_data JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_workflows_nodes ON workflows USING GIN (nodes);
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows (user_id);
CREATE INDEX IF NOT EXISTS idx_trigger_resources_workflow_id ON trigger_resources (workflow_id);
CREATE INDEX IF NOT EXISTS idx_trigger_resources_config ON trigger_resources USING GIN (config);
