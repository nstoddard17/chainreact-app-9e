-- Drop and recreate the integrations table with proper structure
DROP TABLE IF EXISTS integrations;

CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  granted_scopes TEXT[],
  missing_scopes TEXT[],
  scope_validation_status TEXT,
  last_scope_check TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'connected',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Add indexes for better performance
CREATE INDEX idx_integrations_user_id ON integrations(user_id);
CREATE INDEX idx_integrations_provider ON integrations(provider);
CREATE INDEX idx_integrations_status ON integrations(status);

-- Enable Row Level Security
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own integrations" 
  ON integrations FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own integrations" 
  ON integrations FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own integrations" 
  ON integrations FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own integrations" 
  ON integrations FOR DELETE 
  USING (auth.uid() = user_id);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically update the updated_at column
CREATE TRIGGER update_integrations_updated_at
BEFORE UPDATE ON integrations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
