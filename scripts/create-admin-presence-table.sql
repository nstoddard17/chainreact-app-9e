-- Create a simple admin presence table for tracking who's currently on the admin panel
-- This is much simpler and more secure than tracking all user activity

-- Create the admin_presence table
CREATE TABLE IF NOT EXISTS admin_presence (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'admin',
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on admin_presence
ALTER TABLE admin_presence ENABLE ROW LEVEL SECURITY;

-- Create policy for admins to read all presence records
CREATE POLICY "Admins can read all admin presence" ON admin_presence
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create policy for admins to insert/update their own presence
CREATE POLICY "Admins can manage their own presence" ON admin_presence
  FOR ALL USING (
    auth.uid() = id AND
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_admin_presence_last_seen ON admin_presence(last_seen);

-- Add comment
COMMENT ON TABLE admin_presence IS 'Tracks which admins are currently viewing the admin panel';

-- Verify the table was created
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'admin_presence'
ORDER BY ordinal_position; 