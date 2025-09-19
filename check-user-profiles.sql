-- Check the current state of user profiles
-- This will help debug why existing users are being redirected to username setup

-- 1. Check if user_profiles table exists and its structure
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'user_profiles'
ORDER BY ordinal_position;

-- 2. Check how many users have profiles
SELECT
    COUNT(DISTINCT u.id) as total_users,
    COUNT(DISTINCT p.id) as users_with_profiles,
    COUNT(DISTINCT CASE WHEN p.username IS NOT NULL AND p.username != '' THEN p.id END) as users_with_usernames
FROM auth.users u
LEFT JOIN public.user_profiles p ON u.id = p.id;

-- 3. Find users without profiles or without usernames
SELECT
    u.id,
    u.email,
    u.created_at,
    u.raw_user_meta_data->>'full_name' as metadata_full_name,
    u.raw_user_meta_data->>'username' as metadata_username,
    p.username as profile_username,
    p.role as profile_role,
    CASE
        WHEN p.id IS NULL THEN 'No profile'
        WHEN p.username IS NULL THEN 'Profile exists but no username'
        WHEN p.username = '' THEN 'Profile exists but empty username'
        ELSE 'OK'
    END as status
FROM auth.users u
LEFT JOIN public.user_profiles p ON u.id = p.id
WHERE p.id IS NULL
   OR p.username IS NULL
   OR p.username = ''
ORDER BY u.created_at DESC;

-- 4. Fix missing profiles for all existing users
-- This creates profiles using metadata or email as username
INSERT INTO public.user_profiles (id, username, full_name, role, provider, created_at, updated_at)
SELECT
    u.id,
    COALESCE(
        u.raw_user_meta_data->>'username',
        u.raw_user_meta_data->>'preferred_username',
        SPLIT_PART(u.email, '@', 1)
    ) as username,
    COALESCE(
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        SPLIT_PART(u.email, '@', 1)
    ) as full_name,
    COALESCE(
        p.role,
        CASE
            WHEN bt.email IS NOT NULL THEN 'beta-pro'
            WHEN u.raw_user_meta_data->>'is_beta_tester' = 'true' THEN 'beta-pro'
            ELSE 'free'
        END
    ) as role,
    COALESCE(
        u.app_metadata->>'provider',
        CASE
            WHEN u.email LIKE '%gmail.com' AND u.raw_app_meta_data->>'provider' = 'google' THEN 'google'
            ELSE 'email'
        END
    ) as provider,
    u.created_at,
    NOW()
FROM auth.users u
LEFT JOIN public.user_profiles p ON u.id = p.id
LEFT JOIN public.beta_testers bt ON bt.email = u.email
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 5. Update existing profiles that have NULL or empty usernames
UPDATE public.user_profiles p
SET
    username = COALESCE(
        username,
        u.raw_user_meta_data->>'username',
        u.raw_user_meta_data->>'preferred_username',
        SPLIT_PART(u.email, '@', 1)
    ),
    updated_at = NOW()
FROM auth.users u
WHERE p.id = u.id
AND (p.username IS NULL OR p.username = '');

-- 6. Ensure beta testers have the correct role
UPDATE public.user_profiles p
SET
    role = 'beta-pro',
    updated_at = NOW()
FROM auth.users u
JOIN public.beta_testers bt ON bt.email = u.email
WHERE p.id = u.id
AND p.role != 'beta-pro';

-- 7. Show the final status
SELECT
    u.email,
    p.username,
    p.role,
    p.provider,
    CASE
        WHEN p.username IS NOT NULL AND p.username != '' THEN '✅ Ready'
        ELSE '❌ Needs username'
    END as status
FROM auth.users u
LEFT JOIN public.user_profiles p ON u.id = p.id
ORDER BY u.created_at DESC;