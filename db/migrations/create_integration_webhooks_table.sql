-- Create integration webhooks table for integration-specific webhook configurations

CREATE TABLE IF NOT EXISTS integration_webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider_id VARCHAR(100) NOT NULL,
  webhook_url TEXT NOT NULL,
  trigger_types TEXT[] NOT NULL DEFAULT '{}',
  integration_config JSONB DEFAULT '{}',
  external_config JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_triggered TIMESTAMP WITH TIME ZONE,
  trigger_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
); 