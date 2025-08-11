-- Create table for external webhook registrations (Discord, Slack, etc.)
CREATE TABLE IF NOT EXISTS webhook_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  webhook_url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  external_webhook_id VARCHAR(255), -- Discord webhook ID
  external_webhook_token TEXT, -- Discord webhook token
  channel_id VARCHAR(255), -- Discord channel ID where webhook was created
  metadata JSONB, -- Additional provider-specific data
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_webhook_registrations_provider ON webhook_registrations(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_registrations_webhook_url ON webhook_registrations(webhook_url);
CREATE INDEX IF NOT EXISTS idx_webhook_registrations_status ON webhook_registrations(status);
CREATE INDEX IF NOT EXISTS idx_webhook_registrations_external_id ON webhook_registrations(external_webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_registrations_channel_id ON webhook_registrations(channel_id);

-- Enable RLS
ALTER TABLE webhook_registrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admin access for webhook management)
CREATE POLICY "Admin can manage webhook registrations" ON webhook_registrations
  FOR ALL USING (auth.role() = 'admin');

-- Service role can insert/update registrations during webhook setup
CREATE POLICY "Service can manage webhook registrations" ON webhook_registrations
  FOR ALL USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_webhook_registration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_webhook_registration_updated_at
  BEFORE UPDATE ON webhook_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_registration_updated_at();

-- Function to clean up orphaned webhook registrations
CREATE OR REPLACE FUNCTION cleanup_orphaned_webhooks()
RETURNS void AS $$
BEGIN
  -- Delete webhook registrations that are inactive for more than 7 days
  DELETE FROM webhook_registrations 
  WHERE status = 'inactive' AND updated_at < NOW() - INTERVAL '7 days';
  
  -- Log cleanup
  RAISE NOTICE 'Cleaned up orphaned webhook registrations';
END;
$$ LANGUAGE plpgsql;
