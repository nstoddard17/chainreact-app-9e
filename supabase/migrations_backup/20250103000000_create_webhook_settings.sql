-- Create webhook_settings table for admin-configurable webhooks
CREATE TABLE IF NOT EXISTS webhook_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  webhook_url TEXT NOT NULL,
  webhook_type TEXT NOT NULL, -- 'discord', 'slack', 'custom'
  enabled BOOLEAN DEFAULT true,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on setting_key for fast lookups
CREATE INDEX IF NOT EXISTS idx_webhook_settings_key ON webhook_settings(setting_key);

-- Create index on enabled for filtering active webhooks
CREATE INDEX IF NOT EXISTS idx_webhook_settings_enabled ON webhook_settings(enabled);

-- Add RLS policies
ALTER TABLE webhook_settings ENABLE ROW LEVEL SECURITY;

-- Only service role can manage webhook settings
CREATE POLICY "Service role can manage webhook_settings"
  ON webhook_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Insert default error reports webhook setting (disabled by default)
INSERT INTO webhook_settings (setting_key, webhook_url, webhook_type, enabled, description, metadata)
VALUES (
  'error_reports',
  '',
  'discord',
  false,
  'Webhook for receiving error reports from failed action/trigger tests',
  '{"channel_name": "", "mention_role": ""}'::jsonb
)
ON CONFLICT (setting_key) DO NOTHING;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_webhook_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhook_settings_updated_at
  BEFORE UPDATE ON webhook_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_settings_updated_at();

COMMENT ON TABLE webhook_settings IS 'Admin-configurable webhook settings for various system notifications';
COMMENT ON COLUMN webhook_settings.setting_key IS 'Unique key for the webhook setting (e.g., error_reports)';
COMMENT ON COLUMN webhook_settings.webhook_url IS 'The webhook URL to send notifications to';
COMMENT ON COLUMN webhook_settings.webhook_type IS 'Type of webhook: discord, slack, or custom';
COMMENT ON COLUMN webhook_settings.enabled IS 'Whether this webhook is currently enabled';
COMMENT ON COLUMN webhook_settings.metadata IS 'Additional metadata (channel name, roles to mention, etc.)';
