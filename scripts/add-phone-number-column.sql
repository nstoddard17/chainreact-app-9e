-- Add phone_number column to user_profiles table
-- This column will store the user's phone number

-- Add phone_number column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE user_profiles 
    ADD COLUMN phone_number VARCHAR(20);
  END IF;
END
$$;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.phone_number IS 'User phone number for contact purposes'; 