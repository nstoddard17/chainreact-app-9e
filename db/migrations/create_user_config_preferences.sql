-- Create user_config_preferences table
CREATE TABLE IF NOT EXISTS user_config_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_type VARCHAR(255) NOT NULL,
  provider_id VARCHAR(100) NOT NULL,
  field_name VARCHAR(255) NOT NULL,
  field_value TEXT,
  field_type VARCHAR(50) NOT NULL DEFAULT 'string',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique preferences per user, node type, and field
  UNIQUE(user_id, node_type, field_name)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_config_preferences_user_id ON user_config_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_config_preferences_node_type ON user_config_preferences(node_type);
CREATE INDEX IF NOT EXISTS idx_user_config_preferences_provider_id ON user_config_preferences(provider_id);
CREATE INDEX IF NOT EXISTS idx_user_config_preferences_updated_at ON user_config_preferences(updated_at);

-- Add RLS (Row Level Security) policies
ALTER TABLE user_config_preferences ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to only see their own preferences
CREATE POLICY "Users can view their own config preferences" ON user_config_preferences
  FOR SELECT USING (auth.uid() = user_id);

-- Policy to allow users to insert their own preferences
CREATE POLICY "Users can insert their own config preferences" ON user_config_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy to allow users to update their own preferences
CREATE POLICY "Users can update their own config preferences" ON user_config_preferences
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy to allow users to delete their own preferences
CREATE POLICY "Users can delete their own config preferences" ON user_config_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_config_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_config_preferences_updated_at
  BEFORE UPDATE ON user_config_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_config_preferences_updated_at(); 