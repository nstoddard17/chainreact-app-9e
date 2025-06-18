-- Debug script to check user filtering for integrations
-- This will help identify if there are any cross-contamination issues

-- Check all integrations and their user associations
SELECT 
    i.id,
    i.user_id,
    i.provider,
    i.status,
    i.created_at,
    u.email as user_email
FROM integrations i
LEFT JOIN auth.users u ON i.user_id = u.id
ORDER BY i.created_at DESC
LIMIT 20;

-- Check for any integrations without user_id
SELECT COUNT(*) as integrations_without_user_id
FROM integrations 
WHERE user_id IS NULL;

-- Check for any integrations with invalid user_id
SELECT COUNT(*) as integrations_with_invalid_user_id
FROM integrations i
LEFT JOIN auth.users u ON i.user_id = u.id
WHERE u.id IS NULL AND i.user_id IS NOT NULL;

-- Check integration counts per user
SELECT 
    u.email,
    COUNT(i.id) as integration_count,
    STRING_AGG(i.provider, ', ') as providers
FROM auth.users u
LEFT JOIN integrations i ON u.id = i.user_id
GROUP BY u.id, u.email
ORDER BY integration_count DESC;

-- Check for duplicate integrations per user/provider combination
SELECT 
    user_id,
    provider,
    COUNT(*) as count
FROM integrations
GROUP BY user_id, provider
HAVING COUNT(*) > 1
ORDER BY count DESC; 