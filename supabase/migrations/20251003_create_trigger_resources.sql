-- Migration: Create trigger_resources table for unified trigger lifecycle management
-- Created: 2025-10-03
-- Purpose: Replace provider-specific subscription tables with unified trigger_resources

-- Create trigger_resources table
CREATE TABLE IF NOT EXISTS trigger_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identification
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL, -- The trigger node ID in the workflow

  -- Provider information
  provider_id TEXT NOT NULL, -- e.g., 'microsoft-outlook', 'gmail', 'airtable'
  trigger_type TEXT NOT NULL, -- e.g., 'new_email', 'file_created'
  resource_type TEXT NOT NULL, -- e.g., 'subscription', 'webhook', 'watch'

  -- External resource tracking
  external_id TEXT NOT NULL, -- ID in the external system (subscription ID, webhook ID, etc.)

  -- Configuration and metadata
  config JSONB DEFAULT '{}', -- Provider-specific config (clientState, etc.)
  metadata JSONB DEFAULT '{}', -- Additional tracking data

  -- Lifecycle tracking
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'deleted', 'error'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- When resource needs renewal (for subscriptions)
  deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete timestamp

  -- Error tracking
  last_error TEXT,
  error_count INTEGER DEFAULT 0,

  -- Indexes for efficient lookups
  CONSTRAINT trigger_resources_workflow_node_unique UNIQUE (workflow_id, node_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trigger_resources_workflow ON trigger_resources(workflow_id);
CREATE INDEX IF NOT EXISTS idx_trigger_resources_user ON trigger_resources(user_id);
CREATE INDEX IF NOT EXISTS idx_trigger_resources_provider ON trigger_resources(provider_id);
CREATE INDEX IF NOT EXISTS idx_trigger_resources_external_id ON trigger_resources(external_id);
CREATE INDEX IF NOT EXISTS idx_trigger_resources_status ON trigger_resources(status);
CREATE INDEX IF NOT EXISTS idx_trigger_resources_expires_at ON trigger_resources(expires_at) WHERE expires_at IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_trigger_resources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_resources_updated_at ON trigger_resources;

CREATE TRIGGER trigger_resources_updated_at
BEFORE UPDATE ON trigger_resources
FOR EACH ROW
EXECUTE FUNCTION update_trigger_resources_updated_at();

-- RLS policies
ALTER TABLE trigger_resources ENABLE ROW LEVEL SECURITY;

-- Users can view their own trigger resources
CREATE POLICY trigger_resources_select_policy ON trigger_resources
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (for backend operations)
CREATE POLICY trigger_resources_service_role_policy ON trigger_resources
  FOR ALL
  USING (auth.role() = 'service_role');

-- Update microsoft_webhook_queue to reference trigger_resources
-- Drop old foreign key constraint
ALTER TABLE microsoft_webhook_queue
DROP CONSTRAINT IF EXISTS microsoft_webhook_queue_subscription_id_fkey;

-- Add new optional column for trigger_resource_id (keep subscription_id for backward compatibility during migration)
ALTER TABLE microsoft_webhook_queue
ADD COLUMN IF NOT EXISTS trigger_resource_id UUID REFERENCES trigger_resources(id) ON DELETE CASCADE;

-- Create index on new column
CREATE INDEX IF NOT EXISTS idx_webhook_queue_trigger_resource ON microsoft_webhook_queue(trigger_resource_id);

-- Comments
COMMENT ON TABLE trigger_resources IS 'Unified table for tracking external resources created for workflow triggers (subscriptions, webhooks, watches, etc.)';
COMMENT ON COLUMN trigger_resources.external_id IS 'ID in the external system (e.g., Microsoft Graph subscription ID, Gmail watch ID)';
COMMENT ON COLUMN trigger_resources.config IS 'Provider-specific configuration like clientState, resource path, etc.';
COMMENT ON COLUMN trigger_resources.expires_at IS 'When the resource expires and needs renewal (for time-limited subscriptions)';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON trigger_resources TO service_role;
GRANT SELECT ON trigger_resources TO authenticated;
