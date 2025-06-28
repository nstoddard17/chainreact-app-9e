-- Debug script to test online status logic
-- Run this in your Supabase SQL editor to see what's happening

-- 1. Check if last_seen_at column exists and has data
SELECT 
  'Column Check' as test,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'user_profiles' AND column_name = 'last_seen_at';

-- 2. Check current user data
SELECT 
  'User Data' as test,
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

-- 3. Test the online status logic
SELECT 
  'Online Status Test' as test,
  COUNT(*) as total_users,
  COUNT(CASE WHEN last_seen_at IS NULL THEN 1 END) as never_seen,
  COUNT(CASE WHEN last_seen_at <= NOW() - INTERVAL '5 minutes' THEN 1 END) as offline_users,
  COUNT(CASE WHEN last_seen_at > NOW() - INTERVAL '5 minutes' THEN 1 END) as online_users
FROM user_profiles;

-- 4. Check RLS policies
SELECT 
  'RLS Policies' as test,
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'user_profiles'
ORDER BY policyname; 