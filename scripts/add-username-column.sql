-- Add username column to user_profiles table
-- This column will be read-only and cannot be changed by users

-- Add username column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'username'
  ) THEN
    ALTER TABLE user_profiles 
    ADD COLUMN username VARCHAR(50) UNIQUE;
  END IF;
END
$$;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.username IS 'Unique username for the user (read-only field)'; 