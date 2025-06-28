-- Diagnostic script to understand user_profiles issues
-- Run this in your Supabase SQL editor to see what's happening

-- 1. Check if the table exists and its structure
SELECT 
  table_name,
  table_type
FROM information_schema.tables 
WHERE table_name = 'user_profiles';

-- 2. Check table columns
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'user_profiles'
ORDER BY ordinal_position;

-- 3. Check RLS status
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE tablename = 'user_profiles';

-- 4. Check existing policies
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

-- 5. Check if there are any existing profiles
SELECT 
  id,
  full_name,
  username,
  role,
  created_at
FROM user_profiles 
LIMIT 5;

-- 6. Check auth.users table to see if users exist
SELECT 
  id,
  email,
  created_at
FROM auth.users 
LIMIT 5;

-- 7. Test if we can insert a test profile (this will fail if RLS is blocking)
-- Uncomment the lines below to test insertion
/*
INSERT INTO user_profiles (
  id, 
  full_name, 
  provider, 
  role, 
  created_at, 
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Test User',
  'email',
  'free',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;
*/

-- 8. Check for any foreign key constraints
SELECT 
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'user_profiles'; 