-- Add phone_number and secondary_email columns to user_profiles table
-- This script adds both columns in a single transaction

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

-- Add secondary_email column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'secondary_email'
  ) THEN
    ALTER TABLE user_profiles 
    ADD COLUMN secondary_email VARCHAR(255);
  END IF;
END
$$;

-- Add comments for documentation
COMMENT ON COLUMN user_profiles.phone_number IS 'User phone number for contact purposes';
COMMENT ON COLUMN user_profiles.secondary_email IS 'Secondary email address for backup contact'; 