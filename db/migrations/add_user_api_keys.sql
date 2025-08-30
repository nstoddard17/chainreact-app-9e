-- Create table for storing user's custom API keys (encrypted)
CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'openai', 'anthropic', 'google', 'mistral'
  encrypted_key TEXT NOT NULL, -- AES-256 encrypted
  key_hint VARCHAR(20), -- Last 4 characters for identification
  model VARCHAR(100), -- Default model for this key
  monthly_budget DECIMAL(10,2) DEFAULT 100.00,
  current_usage DECIMAL(10,2) DEFAULT 0.00,
  usage_reset_date DATE,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB, -- Additional settings
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, provider)
);

-- Create table for tracking custom API key usage
CREATE TABLE IF NOT EXISTS user_api_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES user_api_keys(id) ON DELETE CASCADE,
  workflow_id UUID,
  execution_id UUID,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost DECIMAL(10,6) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table for workflow conversation memory
CREATE TABLE IF NOT EXISTS workflow_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL,
  execution_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  context JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days'
);

-- Create table for AI routing decisions audit
CREATE TABLE IF NOT EXISTS ai_routing_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id UUID,
  node_id VARCHAR(255),
  input_data JSONB,
  routing_decision JSONB,
  selected_paths TEXT[],
  confidence_scores JSONB,
  model_used VARCHAR(100),
  tokens_used INTEGER,
  cost DECIMAL(10,6),
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table for AI error logs
CREATE TABLE IF NOT EXISTS ai_error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  feature VARCHAR(50) NOT NULL,
  model VARCHAR(100),
  error TEXT NOT NULL,
  context JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_provider ON user_api_keys(provider);
CREATE INDEX IF NOT EXISTS idx_user_api_usage_user_id ON user_api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_usage_created_at ON user_api_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_conversations_workflow_id ON workflow_conversations(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_conversations_expires_at ON workflow_conversations(expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_routing_decisions_user_id ON ai_routing_decisions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_routing_decisions_workflow_id ON ai_routing_decisions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_ai_error_logs_user_id ON ai_error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_error_logs_timestamp ON ai_error_logs(timestamp);

-- RLS Policies
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_routing_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_error_logs ENABLE ROW LEVEL SECURITY;

-- User API Keys policies
CREATE POLICY "Users can view their own API keys" ON user_api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API keys" ON user_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys" ON user_api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys" ON user_api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- User API Usage policies
CREATE POLICY "Users can view their own API usage" ON user_api_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API usage" ON user_api_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Workflow Conversations policies
CREATE POLICY "Users can view their own conversations" ON workflow_conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conversations" ON workflow_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations" ON workflow_conversations
  FOR DELETE USING (auth.uid() = user_id);

-- AI Routing Decisions policies
CREATE POLICY "Users can view their own routing decisions" ON ai_routing_decisions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own routing decisions" ON ai_routing_decisions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- AI Error Logs policies
CREATE POLICY "Users can view their own error logs" ON ai_error_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own error logs" ON ai_error_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Function to automatically update usage on API key usage insert
CREATE OR REPLACE FUNCTION update_user_api_key_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE user_api_keys
  SET 
    current_usage = current_usage + NEW.estimated_cost,
    last_used_at = NOW(),
    updated_at = NOW()
  WHERE id = NEW.api_key_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update API key usage
CREATE TRIGGER trigger_update_user_api_key_usage
  AFTER INSERT ON user_api_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_user_api_key_usage();

-- Function to reset monthly usage
CREATE OR REPLACE FUNCTION reset_monthly_api_usage()
RETURNS void AS $$
BEGIN
  UPDATE user_api_keys
  SET 
    current_usage = 0,
    usage_reset_date = CURRENT_DATE,
    updated_at = NOW()
  WHERE 
    usage_reset_date < CURRENT_DATE - INTERVAL '1 month'
    OR usage_reset_date IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired conversations
CREATE OR REPLACE FUNCTION cleanup_expired_conversations()
RETURNS void AS $$
BEGIN
  DELETE FROM workflow_conversations
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;