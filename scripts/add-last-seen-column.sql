-- Add last_seen_at column to user_profiles table for online status tracking
-- This will track when users were last active

-- Check if column already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'last_seen_at'
  ) THEN
    -- Add the column
    ALTER TABLE user_profiles 
    ADD COLUMN last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    
    -- Add comment
    COMMENT ON COLUMN user_profiles.last_seen_at IS 'Timestamp of when user was last active (for online status tracking)';
    
    -- Create index for better performance
    CREATE INDEX IF NOT EXISTS idx_user_profiles_last_seen_at ON user_profiles(last_seen_at);
    
    RAISE NOTICE 'Added last_seen_at column to user_profiles table';
  ELSE
    RAISE NOTICE 'last_seen_at column already exists in user_profiles table';
  END IF;
END
$$;

-- Verify the column was added
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'user_profiles' AND column_name = 'last_seen_at'; 