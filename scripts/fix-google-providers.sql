-- Fix Google users who have incorrect provider in user_profiles table
-- This script updates user_profiles.provider to 'google' for users who signed up with Google

-- First, let's see what we have
SELECT 
  up.id,
  up.full_name,
  up.provider as current_provider,
  au.email,
  au.app_metadata,
  au.user_metadata,
  au.identities
FROM user_profiles up
JOIN auth.users au ON up.id = au.id
WHERE au.identities IS NOT NULL 
  AND au.identities::text LIKE '%google%'
  AND (up.provider IS NULL OR up.provider != 'google');

-- Update user_profiles to set provider = 'google' for users who have Google identities
UPDATE user_profiles 
SET 
  provider = 'google',
  updated_at = NOW()
WHERE id IN (
  SELECT au.id 
  FROM auth.users au 
  WHERE au.identities IS NOT NULL 
    AND au.identities::text LIKE '%google%'
);

-- Verify the changes
SELECT 
  up.id,
  up.full_name,
  up.provider,
  au.email,
  au.identities
FROM user_profiles up
JOIN auth.users au ON up.id = au.id
WHERE au.identities IS NOT NULL 
  AND au.identities::text LIKE '%google%'
ORDER BY up.updated_at DESC;

-- Also set provider = 'email' for users who don't have Google identities
UPDATE user_profiles 
SET 
  provider = 'email',
  updated_at = NOW()
WHERE id IN (
  SELECT au.id 
  FROM auth.users au 
  WHERE (au.identities IS NULL OR au.identities::text NOT LIKE '%google%')
    AND au.email IS NOT NULL
)
AND (provider IS NULL OR provider != 'email');

-- Show final state
SELECT 
  provider,
  COUNT(*) as user_count
FROM user_profiles 
GROUP BY provider
ORDER BY user_count DESC; 