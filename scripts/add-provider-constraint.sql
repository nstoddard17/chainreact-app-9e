-- Add check constraint to ensure provider values are consistent
-- This will prevent future issues with case sensitivity

-- First, let's see what provider values we currently have
SELECT DISTINCT provider FROM user_profiles WHERE provider IS NOT NULL;

-- Add check constraint to ensure provider is either 'google' or 'email' (lowercase)
ALTER TABLE user_profiles 
ADD CONSTRAINT check_provider_values 
CHECK (provider IN ('google', 'email'));

-- If the constraint fails, we need to fix the data first
-- Let's update any inconsistent values
UPDATE user_profiles 
SET provider = LOWER(provider)
WHERE provider IS NOT NULL 
  AND provider != LOWER(provider);

-- Show the final state
 