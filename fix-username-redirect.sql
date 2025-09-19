-- Quick fix for users who have usernames but are still being redirected

-- 1. First check if Row Level Security (RLS) is preventing reads
-- The middleware might not be able to read the profile due to RLS policies

-- Check current RLS policies on user_profiles
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'user_profiles';

-- 2. Ensure authenticated users can read their own profile
-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;

-- Create a policy that allows users to read their own profile
CREATE POLICY "Users can read own profile"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- 3. Also ensure service role can read all profiles (for middleware)
DROP POLICY IF EXISTS "Service role can read all profiles" ON public.user_profiles;

CREATE POLICY "Service role can read all profiles"
ON public.user_profiles
FOR SELECT
TO service_role
USING (true);

-- 4. Grant necessary permissions
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_profiles TO anon;
GRANT ALL ON public.user_profiles TO service_role;

-- 5. If your username exists but you're still redirected,
-- this will ensure it's properly formatted
UPDATE public.user_profiles
SET
    username = TRIM(username),
    updated_at = NOW()
WHERE username IS NOT NULL
AND username != ''
AND (
    username != TRIM(username)
    OR username LIKE ' %'
    OR username LIKE '% '
);

-- 6. Show any profiles that might have issues
SELECT
    id,
    email,
    username,
    '>' || COALESCE(username, 'NULL') || '<' as username_visual,
    LENGTH(username) as length,
    role,
    provider
FROM public.user_profiles p
JOIN auth.users u ON u.id = p.id
WHERE username IS NULL
   OR username = ''
   OR TRIM(username) = ''
   OR username != TRIM(username);