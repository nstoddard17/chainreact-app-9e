-- Add unique constraint on username column
-- This ensures usernames are unique across all users

-- First, remove any duplicate usernames if they exist
-- (This is a safety measure in case there are existing duplicates)
UPDATE user_profiles 
SET username = username || '_' || id 
WHERE username IN (
  SELECT username 
  FROM user_profiles 
  GROUP BY username 
  HAVING COUNT(*) > 1
);

-- Add unique constraint on username column
ALTER TABLE user_profiles 
ADD CONSTRAINT user_profiles_username_unique UNIQUE (username);

-- Add index for better performance on username lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles (username);

-- Verify the constraint was added
SELECT 
  constraint_name, 
  constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'user_profiles' 
AND constraint_name = 'user_profiles_username_unique'; 