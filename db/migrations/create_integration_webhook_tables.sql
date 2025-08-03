-- Create integration webhook tables for automatic webhook setup

-- Table for integration webhook configurations
CREATE TABLE IF NOT EXISTS integration_webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id VARCHAR(100) NOT NULL,
  webhook_url TEXT NOT NULL,
  trigger_types TEXT[] NOT NULL,
  integration_config JSONB DEFAULT '{}',
  external_config JSONB,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_triggered TIMESTAMP WITH TIME ZONE,
  trigger_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for integration webhook execution logs
CREATE TABLE IF NOT EXISTS integration_webhook_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID REFERENCES integration_webhooks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id VARCHAR(100) NOT NULL,
  trigger_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'pending')),
  response_code INTEGER,
  response_body TEXT,
  error_message TEXT,
  execution_time_ms INTEGER,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_user_id ON integration_webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_provider_id ON integration_webhooks(provider_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_status ON integration_webhooks(status);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_created_at ON integration_webhooks(created_at);

CREATE INDEX IF NOT EXISTS idx_integration_webhook_executions_webhook_id ON integration_webhook_executions(webhook_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_executions_user_id ON integration_webhook_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_executions_provider_id ON integration_webhook_executions(provider_id);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_executions_trigger_type ON integration_webhook_executions(trigger_type);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_executions_status ON integration_webhook_executions(status);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_executions_triggered_at ON integration_webhook_executions(triggered_at);

-- RLS Policies for integration_webhooks
ALTER TABLE integration_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own integration webhooks" ON integration_webhooks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own integration webhooks" ON integration_webhooks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own integration webhooks" ON integration_webhooks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own integration webhooks" ON integration_webhooks
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for integration_webhook_executions
ALTER TABLE integration_webhook_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own integration webhook executions" ON integration_webhook_executions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own integration webhook executions" ON integration_webhook_executions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Function to update integration webhook updated_at timestamp
CREATE OR REPLACE FUNCTION update_integration_webhook_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update integration webhook updated_at
CREATE TRIGGER trigger_update_integration_webhook_updated_at
  BEFORE UPDATE ON integration_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_integration_webhook_updated_at(); 