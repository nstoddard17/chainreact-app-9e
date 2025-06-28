-- Test script to check user_presence table and data
-- Run this in your Supabase SQL editor

-- 1. Check if the table exists
SELECT 
  'Table Check' as test,
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_name = 'user_presence';

-- 2. Check table structure
SELECT 
  'Structure Check' as test,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'user_presence'
ORDER BY ordinal_position;

-- 3. Check RLS policies
SELECT 
  'RLS Policies' as test,
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'user_presence'
ORDER BY policyname;

-- 4. Check if there's any data
SELECT 
  'Data Check' as test,
  COUNT(*) as total_records,
  COUNT(CASE WHEN last_seen > NOW() - INTERVAL '5 minutes' THEN 1 END) as recent_records
FROM user_presence;

-- 5. Show recent presence data
SELECT 
  'Recent Presence' as test,
  id,
  full_name,
  email,
  role,
  last_seen,
  CASE 
    WHEN last_seen > NOW() - INTERVAL '5 minutes' THEN 'Online'
    ELSE 'Offline'
  END as status
FROM user_presence 
ORDER BY last_seen DESC; 