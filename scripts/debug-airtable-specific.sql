-- Debug specific Airtable integration that's failing with invalid_client error
-- This helps identify which integration and why it's failing

-- Show all Airtable integrations with their details
SELECT 
    'All Airtable Integrations' as info,
    id,
    user_id,
    status,
    expires_at,
    refresh_token IS NOT NULL as has_refresh_token,
    access_token IS NOT NULL as has_access_token,
    created_at,
    updated_at,
    disconnected_at,
    disconnect_reason
FROM integrations 
WHERE provider = 'airtable'
ORDER BY updated_at DESC;

-- Show which Airtable integration is expired and needs refresh
SELECT 
    'Expired Airtable Integrations' as info,
    id,
    user_id,
    status,
    expires_at,
    refresh_token IS NOT NULL as has_refresh_token,
    CASE 
        WHEN expires_at IS NULL THEN 'No expiry'
        WHEN expires_at < NOW() THEN 'EXPIRED - Needs refresh'
        WHEN expires_at < NOW() + INTERVAL '10 minutes' THEN 'Expiring soon'
        ELSE 'Valid'
    END as expiry_status,
    updated_at
FROM integrations 
WHERE provider = 'airtable'
  AND (
    status = 'expired' 
    OR (expires_at IS NOT NULL AND expires_at < NOW())
  )
ORDER BY updated_at DESC;

-- Show recent token refresh logs that mention Airtable
SELECT 
    'Recent Airtable Token Refresh Logs' as info,
    job_id,
    executed_at,
    status,
    error_count,
    errors,
    total_processed,
    successful_refreshes,
    failed_refreshes
FROM token_refresh_logs 
WHERE errors::text LIKE '%airtable%'
   OR errors::text LIKE '%Airtable%'
ORDER BY executed_at DESC
LIMIT 5;

-- Show the specific integration that's likely causing the issue
-- (the one with status 'expired' that the cron job is trying to refresh)
SELECT 
    'Integration Causing Invalid Client Error' as info,
    id,
    user_id,
    status,
    expires_at,
    refresh_token IS NOT NULL as has_refresh_token,
    access_token IS NOT NULL as has_access_token,
    created_at,
    updated_at,
    'This integration is likely the one failing with invalid_client' as note
FROM integrations 
WHERE provider = 'airtable'
  AND status = 'expired'
  AND refresh_token IS NOT NULL
ORDER BY updated_at DESC;

-- Check if the integration has valid tokens
SELECT 
    'Token Validation Check' as info,
    id,
    user_id,
    status,
    CASE 
        WHEN access_token IS NULL OR access_token = '' THEN 'No access token'
        ELSE 'Has access token'
    END as access_token_status,
    CASE 
        WHEN refresh_token IS NULL OR refresh_token = '' THEN 'No refresh token'
        ELSE 'Has refresh token'
    END as refresh_token_status,
    CASE 
        WHEN expires_at IS NULL THEN 'No expiry date'
        WHEN expires_at < NOW() THEN 'Expired'
        ELSE 'Valid expiry'
    END as expiry_status
FROM integrations 
WHERE provider = 'airtable'
  AND status = 'expired'
ORDER BY updated_at DESC;
