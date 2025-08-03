-- Create custom webhook tables for user-created webhooks

-- Table for custom webhook configurations
CREATE TABLE IF NOT EXISTS custom_webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  webhook_url TEXT NOT NULL,
  method VARCHAR(10) NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH')),
  headers JSONB DEFAULT '{}',
  body_template TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_triggered TIMESTAMP WITH TIME ZONE,
  trigger_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for custom webhook execution logs
CREATE TABLE IF NOT EXISTS custom_webhook_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID REFERENCES custom_webhooks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'pending')),
  response_code INTEGER,
  response_body TEXT,
  error_message TEXT,
  execution_time_ms INTEGER NOT NULL,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  payload_sent JSONB
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_custom_webhooks_user_id ON custom_webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_webhooks_status ON custom_webhooks(status);
CREATE INDEX IF NOT EXISTS idx_custom_webhooks_created_at ON custom_webhooks(created_at);

CREATE INDEX IF NOT EXISTS idx_custom_webhook_executions_webhook_id ON custom_webhook_executions(webhook_id);
CREATE INDEX IF NOT EXISTS idx_custom_webhook_executions_user_id ON custom_webhook_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_webhook_executions_status ON custom_webhook_executions(status);
CREATE INDEX IF NOT EXISTS idx_custom_webhook_executions_triggered_at ON custom_webhook_executions(triggered_at);

-- RLS Policies for custom_webhooks
ALTER TABLE custom_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own custom webhooks" ON custom_webhooks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own custom webhooks" ON custom_webhooks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own custom webhooks" ON custom_webhooks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own custom webhooks" ON custom_webhooks
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for custom_webhook_executions
ALTER TABLE custom_webhook_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own custom webhook executions" ON custom_webhook_executions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own custom webhook executions" ON custom_webhook_executions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Function to update custom webhook updated_at timestamp
CREATE OR REPLACE FUNCTION update_custom_webhook_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update custom webhook updated_at
CREATE TRIGGER trigger_update_custom_webhook_updated_at
  BEFORE UPDATE ON custom_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_webhook_updated_at(); 