-- Test Airtable OAuth credentials configuration
-- This helps verify if the environment variables are set correctly

-- Check if environment variables are accessible (this is limited in SQL)
SELECT 
    'Environment Variable Check' as info,
    'Note: This can only check if variables are set, not their values' as note;

-- Show the specific integration that's failing
SELECT 
    'Failing Integration Details' as info,
    id,
    user_id,
    provider,
    status,
    expires_at,
    refresh_token IS NOT NULL as has_refresh_token,
    access_token IS NOT NULL as has_access_token,
    created_at,
    updated_at
FROM integrations 
WHERE provider = 'airtable'
  AND status = 'expired'
  AND refresh_token IS NOT NULL
ORDER BY updated_at DESC;

-- Show recent cron job logs to see the exact error
SELECT 
    'Recent Cron Job Logs with Airtable Errors' as info,
    job_id,
    executed_at,
    status,
    error_count,
    CASE 
        WHEN errors::text LIKE '%invalid_client%' THEN 'INVALID_CLIENT_ERROR'
        WHEN errors::text LIKE '%airtable%' THEN 'AIRTABLE_ERROR'
        ELSE 'OTHER_ERROR'
    END as error_type,
    errors
FROM token_refresh_logs 
WHERE errors::text LIKE '%airtable%'
   OR errors::text LIKE '%invalid_client%'
ORDER BY executed_at DESC
LIMIT 3;

-- Check if there are any integrations with malformed tokens
SELECT 
    'Token Format Check' as info,
    id,
    user_id,
    status,
    CASE 
        WHEN refresh_token IS NULL THEN 'No refresh token'
        WHEN refresh_token = '' THEN 'Empty refresh token'
        WHEN LENGTH(refresh_token) < 10 THEN 'Suspiciously short refresh token'
        ELSE 'Refresh token looks valid'
    END as refresh_token_check,
    CASE 
        WHEN access_token IS NULL THEN 'No access token'
        WHEN access_token = '' THEN 'Empty access token'
        WHEN LENGTH(access_token) < 10 THEN 'Suspiciously short access token'
        ELSE 'Access token looks valid'
    END as access_token_check
FROM integrations 
WHERE provider = 'airtable'
  AND status = 'expired'
ORDER BY updated_at DESC; 