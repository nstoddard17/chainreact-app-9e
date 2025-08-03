-- Create webhook management tables

-- Table for webhook configurations
CREATE TABLE IF NOT EXISTS webhook_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type VARCHAR(100) NOT NULL,
  provider_id VARCHAR(100) NOT NULL,
  webhook_url TEXT NOT NULL,
  secret TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_triggered TIMESTAMP WITH TIME ZONE,
  error_count INTEGER DEFAULT 0,
  config JSONB, -- Additional configuration for the webhook
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for webhook execution logs
CREATE TABLE IF NOT EXISTS webhook_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID REFERENCES webhook_configs(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type VARCHAR(100) NOT NULL,
  provider_id VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'pending')),
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for webhook subscriptions (for external service registrations)
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID REFERENCES webhook_configs(id) ON DELETE CASCADE,
  provider_id VARCHAR(100) NOT NULL,
  external_subscription_id VARCHAR(255),
  subscription_url TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_sync TIMESTAMP WITH TIME ZONE,
  sync_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_webhook_configs_user_id ON webhook_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_workflow_id ON webhook_configs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_provider_id ON webhook_configs(provider_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_status ON webhook_configs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_trigger_type ON webhook_configs(trigger_type);

CREATE INDEX IF NOT EXISTS idx_webhook_executions_webhook_id ON webhook_executions(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_executions_workflow_id ON webhook_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_webhook_executions_user_id ON webhook_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_executions_status ON webhook_executions(status);
CREATE INDEX IF NOT EXISTS idx_webhook_executions_created_at ON webhook_executions(created_at);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_webhook_id ON webhook_subscriptions(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_provider_id ON webhook_subscriptions(provider_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_status ON webhook_subscriptions(status);

-- RLS Policies for webhook_configs
ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own webhook configs" ON webhook_configs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own webhook configs" ON webhook_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own webhook configs" ON webhook_configs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own webhook configs" ON webhook_configs
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for webhook_executions
ALTER TABLE webhook_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own webhook executions" ON webhook_executions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own webhook executions" ON webhook_executions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for webhook_subscriptions
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own webhook subscriptions" ON webhook_subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM webhook_configs 
      WHERE webhook_configs.id = webhook_subscriptions.webhook_id 
      AND webhook_configs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own webhook subscriptions" ON webhook_subscriptions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM webhook_configs 
      WHERE webhook_configs.id = webhook_subscriptions.webhook_id 
      AND webhook_configs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own webhook subscriptions" ON webhook_subscriptions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM webhook_configs 
      WHERE webhook_configs.id = webhook_subscriptions.webhook_id 
      AND webhook_configs.user_id = auth.uid()
    )
  );

-- Function to update webhook config updated_at timestamp
CREATE OR REPLACE FUNCTION update_webhook_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update webhook config updated_at
CREATE TRIGGER trigger_update_webhook_config_updated_at
  BEFORE UPDATE ON webhook_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_config_updated_at();

-- Function to update webhook subscription updated_at timestamp
CREATE OR REPLACE FUNCTION update_webhook_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update webhook subscription updated_at
CREATE TRIGGER trigger_update_webhook_subscription_updated_at
  BEFORE UPDATE ON webhook_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_subscription_updated_at();

-- Function to log webhook execution
CREATE OR REPLACE FUNCTION log_webhook_execution(
  p_webhook_id UUID,
  p_workflow_id UUID,
  p_user_id UUID,
  p_trigger_type VARCHAR(100),
  p_provider_id VARCHAR(100),
  p_payload JSONB,
  p_headers JSONB DEFAULT NULL,
  p_status VARCHAR(20) DEFAULT 'pending',
  p_error_message TEXT DEFAULT NULL,
  p_execution_time_ms INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  execution_id UUID;
BEGIN
  INSERT INTO webhook_executions (
    webhook_id,
    workflow_id,
    user_id,
    trigger_type,
    provider_id,
    payload,
    headers,
    status,
    error_message,
    execution_time_ms
  ) VALUES (
    p_webhook_id,
    p_workflow_id,
    p_user_id,
    p_trigger_type,
    p_provider_id,
    p_payload,
    p_headers,
    p_status,
    p_error_message,
    p_execution_time_ms
  ) RETURNING id INTO execution_id;
  
  RETURN execution_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 