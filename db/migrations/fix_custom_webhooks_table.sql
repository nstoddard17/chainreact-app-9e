-- Fix custom_webhooks table by adding missing columns

-- Add user_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'custom_webhooks' AND column_name = 'user_id') THEN
        ALTER TABLE custom_webhooks ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add other missing columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'custom_webhooks' AND column_name = 'method') THEN
        ALTER TABLE custom_webhooks ADD COLUMN method VARCHAR(10) NOT NULL DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH'));
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'custom_webhooks' AND column_name = 'headers') THEN
        ALTER TABLE custom_webhooks ADD COLUMN headers JSONB DEFAULT '{}';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'custom_webhooks' AND column_name = 'body_template') THEN
        ALTER TABLE custom_webhooks ADD COLUMN body_template TEXT;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'custom_webhooks' AND column_name = 'trigger_count') THEN
        ALTER TABLE custom_webhooks ADD COLUMN trigger_count INTEGER DEFAULT 0;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'custom_webhooks' AND column_name = 'error_count') THEN
        ALTER TABLE custom_webhooks ADD COLUMN error_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Create custom_webhook_executions table if it doesn't exist
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

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_custom_webhooks_user_id ON custom_webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_webhooks_status ON custom_webhooks(status);
CREATE INDEX IF NOT EXISTS idx_custom_webhooks_created_at ON custom_webhooks(created_at);

CREATE INDEX IF NOT EXISTS idx_custom_webhook_executions_webhook_id ON custom_webhook_executions(webhook_id);
CREATE INDEX IF NOT EXISTS idx_custom_webhook_executions_user_id ON custom_webhook_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_webhook_executions_status ON custom_webhook_executions(status);
CREATE INDEX IF NOT EXISTS idx_custom_webhook_executions_triggered_at ON custom_webhook_executions(triggered_at);

-- Enable RLS if not already enabled
ALTER TABLE custom_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_webhook_executions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view their own custom webhooks" ON custom_webhooks;
DROP POLICY IF EXISTS "Users can insert their own custom webhooks" ON custom_webhooks;
DROP POLICY IF EXISTS "Users can update their own custom webhooks" ON custom_webhooks;
DROP POLICY IF EXISTS "Users can delete their own custom webhooks" ON custom_webhooks;

DROP POLICY IF EXISTS "Users can view their own custom webhook executions" ON custom_webhook_executions;
DROP POLICY IF EXISTS "Users can insert their own custom webhook executions" ON custom_webhook_executions;

-- Create RLS policies
CREATE POLICY "Users can view their own custom webhooks" ON custom_webhooks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own custom webhooks" ON custom_webhooks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own custom webhooks" ON custom_webhooks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own custom webhooks" ON custom_webhooks
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own custom webhook executions" ON custom_webhook_executions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own custom webhook executions" ON custom_webhook_executions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create or replace the update function
CREATE OR REPLACE FUNCTION update_custom_webhook_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_update_custom_webhook_updated_at ON custom_webhooks;
CREATE TRIGGER trigger_update_custom_webhook_updated_at
  BEFORE UPDATE ON custom_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_webhook_updated_at(); 