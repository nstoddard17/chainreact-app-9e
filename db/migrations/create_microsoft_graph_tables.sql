-- Microsoft Graph Subscriptions
CREATE TABLE IF NOT EXISTS microsoft_graph_subscriptions (
  id TEXT PRIMARY KEY,
  resource TEXT NOT NULL,
  change_type TEXT NOT NULL,
  notification_url TEXT NOT NULL,
  expiration_date_time TIMESTAMP WITH TIME ZONE NOT NULL,
  client_state TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_microsoft_graph_subscriptions_user_id ON microsoft_graph_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_microsoft_graph_subscriptions_status ON microsoft_graph_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_microsoft_graph_subscriptions_expiration ON microsoft_graph_subscriptions(expiration_date_time);

-- Microsoft Graph Webhook Queue
CREATE TABLE IF NOT EXISTS microsoft_webhook_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subscription_id TEXT REFERENCES microsoft_graph_subscriptions(id) ON DELETE SET NULL,
  resource TEXT NOT NULL,
  change_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  processed_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_microsoft_webhook_queue_status ON microsoft_webhook_queue(status);
CREATE INDEX IF NOT EXISTS idx_microsoft_webhook_queue_user_id ON microsoft_webhook_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_microsoft_webhook_queue_created_at ON microsoft_webhook_queue(created_at);

-- Microsoft Graph Webhook Deduplication
CREATE TABLE IF NOT EXISTS microsoft_webhook_dedup (
  dedup_key TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Microsoft Graph Delta Tokens
CREATE TABLE IF NOT EXISTS microsoft_graph_delta_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(resource_type, resource_id)
);

-- Microsoft Graph Normalized Events
CREATE TABLE IF NOT EXISTS microsoft_graph_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_action TEXT NOT NULL,
  event_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_microsoft_graph_events_user_id ON microsoft_graph_events(user_id);
CREATE INDEX IF NOT EXISTS idx_microsoft_graph_events_event_type ON microsoft_graph_events(event_type);
CREATE INDEX IF NOT EXISTS idx_microsoft_graph_events_created_at ON microsoft_graph_events(created_at);

-- Add RLS policies
ALTER TABLE microsoft_graph_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE microsoft_webhook_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE microsoft_webhook_dedup ENABLE ROW LEVEL SECURITY;
ALTER TABLE microsoft_graph_delta_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE microsoft_graph_events ENABLE ROW LEVEL SECURITY;

-- Policies for microsoft_graph_subscriptions
CREATE POLICY "Users can view their own subscriptions" 
  ON microsoft_graph_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Policies for microsoft_graph_events
CREATE POLICY "Users can view their own events" 
  ON microsoft_graph_events FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can access everything
CREATE POLICY "Service role can do anything with microsoft_graph_subscriptions" 
  ON microsoft_graph_subscriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can do anything with microsoft_webhook_queue" 
  ON microsoft_webhook_queue FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can do anything with microsoft_webhook_dedup" 
  ON microsoft_webhook_dedup FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can do anything with microsoft_graph_delta_tokens" 
  ON microsoft_graph_delta_tokens FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can do anything with microsoft_graph_events" 
  ON microsoft_graph_events FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Create a function to clean up old dedup keys (run via cron)
CREATE OR REPLACE FUNCTION clean_microsoft_webhook_dedup()
RETURNS void AS $$
BEGIN
  DELETE FROM microsoft_webhook_dedup
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Create a function to clean up old webhook queue items (run via cron)
CREATE OR REPLACE FUNCTION clean_microsoft_webhook_queue()
RETURNS void AS $$
BEGIN
  DELETE FROM microsoft_webhook_queue
  WHERE 
    (status = 'done' AND created_at < NOW() - INTERVAL '30 days')
    OR
    (status = 'error' AND created_at < NOW() - INTERVAL '30 days');
END;
$$ LANGUAGE plpgsql;
