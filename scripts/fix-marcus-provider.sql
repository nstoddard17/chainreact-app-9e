-- Fix Marcus Leonard's provider from 'Email' to 'google'
-- Based on the user ID: 3d0c4fed-5e0e-43f2-b037-c64ce781e008

-- First, let's see the current state
SELECT 
  id,
  full_name,
  provider,
  updated_at
FROM user_profiles 
WHERE id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008';

-- Update the provider to 'google' (lowercase)
UPDATE user_profiles 
SET 
  provider = 'google',
  updated_at = NOW()
WHERE id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008';

-- Verify the change
SELECT 
  id,
  full_name,
  provider,
  updated_at
FROM user_profiles 
WHERE id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008';

-- Also fix any other users who might have the same issue
-- Update all users with Google identities to have 'google' provider
UPDATE user_profiles 
SET 
  provider = 'google',
  updated_at = NOW()
WHERE id IN (
  SELECT au.id 
  FROM auth.users au 
  WHERE au.identities IS NOT NULL 
    AND au.identities::text LIKE '%google%'
)
AND (provider = 'Email' OR provider = 'email');

-- Show final state for all users
SELECT 
  id,
  full_name,
  provider,
  updated_at
FROM user_profiles 
ORDER BY updated_at DESC; 