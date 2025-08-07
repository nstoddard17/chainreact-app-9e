-- Create microsoft_graph_subscriptions table
CREATE TABLE IF NOT EXISTS microsoft_graph_subscriptions (
  id UUID PRIMARY KEY,
  resource TEXT NOT NULL,
  change_type TEXT NOT NULL,
  notification_url TEXT NOT NULL,
  expiration_date_time TIMESTAMP WITH TIME ZONE NOT NULL,
  client_state TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'deleted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_microsoft_graph_subscriptions_user_id ON microsoft_graph_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_microsoft_graph_subscriptions_status ON microsoft_graph_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_microsoft_graph_subscriptions_expiration ON microsoft_graph_subscriptions(expiration_date_time);

-- Enable RLS
ALTER TABLE microsoft_graph_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own subscriptions" ON microsoft_graph_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions" ON microsoft_graph_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions" ON microsoft_graph_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own subscriptions" ON microsoft_graph_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_microsoft_graph_subscriptions_updated_at 
    BEFORE UPDATE ON microsoft_graph_subscriptions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
