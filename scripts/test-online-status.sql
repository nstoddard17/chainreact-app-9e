-- Test script to verify online status system
-- Run this in your Supabase SQL editor

-- 1. Check if last_seen_at column exists and has data
SELECT 
  id,
  full_name,
  email,
  role,
  last_seen_at,
  CASE 
    WHEN last_seen_at IS NULL THEN 'Never seen'
    WHEN last_seen_at > NOW() - INTERVAL '5 minutes' THEN 'Online'
    ELSE 'Offline'
  END as status
FROM user_profiles 
ORDER BY last_seen_at DESC NULLS LAST;

-- 2. Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'user_profiles'
ORDER BY policyname;

-- 3. Test if we can update last_seen_at (this will be run by the application)
-- The auth.uid() function will return the current user's ID when called from the app

-- 4. Count online vs offline users
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN last_seen_at > NOW() - INTERVAL '5 minutes' THEN 1 END) as online_users,
  COUNT(CASE WHEN last_seen_at <= NOW() - INTERVAL '5 minutes' OR last_seen_at IS NULL THEN 1 END) as offline_users
FROM user_profiles; 