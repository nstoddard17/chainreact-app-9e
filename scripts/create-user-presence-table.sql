-- Create a user presence table for tracking ALL users currently active
-- This tracks which users are currently using the application

-- Create the user_presence table
CREATE TABLE IF NOT EXISTS user_presence (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role TEXT,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on user_presence
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Create policy for admins to read all presence records
CREATE POLICY "Admins can read all user presence" ON user_presence
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create policy for users to insert/update their own presence
CREATE POLICY "Users can manage their own presence" ON user_presence
  FOR ALL USING (auth.uid() = id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence(last_seen);

-- Add comment
COMMENT ON TABLE user_presence IS 'Tracks which users are currently active in the application';

-- Verify the table was created
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'user_presence'
ORDER BY ordinal_position; 