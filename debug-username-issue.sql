-- Debug why users with existing usernames are being redirected
-- Run this to check your specific user account

-- 1. First, let's see ALL user profiles and their usernames
SELECT
    u.id,
    u.email,
    u.created_at,
    p.username,
    p.role,
    p.provider,
    LENGTH(p.username) as username_length,
    p.username IS NULL as is_null,
    p.username = '' as is_empty,
    TRIM(p.username) as trimmed_username,
    CASE
        WHEN p.username IS NULL THEN 'NULL'
        WHEN p.username = '' THEN 'EMPTY'
        WHEN TRIM(p.username) = '' THEN 'WHITESPACE ONLY'
        ELSE 'HAS VALUE: ' || p.username
    END as username_status
FROM auth.users u
LEFT JOIN public.user_profiles p ON u.id = p.id
ORDER BY u.created_at DESC;

-- 2. Check for your specific email (replace with your actual email)
-- This will show exactly what the middleware is seeing
SELECT
    u.id,
    u.email,
    p.id as profile_id,
    p.username,
    p.username IS NULL as username_is_null,
    p.username = '' as username_is_empty,
    TRIM(p.username) = '' as username_is_whitespace,
    LENGTH(p.username) as username_length,
    '>' || COALESCE(p.username, 'NULL') || '<' as username_visual,
    p.role,
    p.provider
FROM auth.users u
LEFT JOIN public.user_profiles p ON u.id = p.id
WHERE u.email = 'your-email@example.com';  -- REPLACE WITH YOUR EMAIL

-- 3. Check if there are any duplicate profiles or other issues
SELECT
    id,
    COUNT(*) as count
FROM public.user_profiles
GROUP BY id
HAVING COUNT(*) > 1;

-- 4. Check the actual middleware condition
-- The middleware checks: (!profile?.username || profile.username.trim() === '' || profile.username === null)
-- Let's simulate that check:
SELECT
    u.email,
    p.username,
    CASE
        WHEN p.username IS NULL THEN 'REDIRECT: username is NULL'
        WHEN p.username = '' THEN 'REDIRECT: username is empty string'
        WHEN TRIM(p.username) = '' THEN 'REDIRECT: username is whitespace only'
        WHEN p.id IS NULL THEN 'REDIRECT: no profile exists'
        ELSE 'OK: has username "' || p.username || '"'
    END as middleware_result
FROM auth.users u
LEFT JOIN public.user_profiles p ON u.id = p.id
WHERE u.email = 'your-email@example.com';  -- REPLACE WITH YOUR EMAIL

-- 5. Check if the issue is with the provider field
-- Sometimes the middleware also checks provider
SELECT DISTINCT provider, COUNT(*)
FROM public.user_profiles
GROUP BY provider;

-- 6. Look for any recent changes to user_profiles
SELECT
    id,
    username,
    updated_at,
    created_at
FROM public.user_profiles
WHERE updated_at > NOW() - INTERVAL '1 hour'
ORDER BY updated_at DESC;