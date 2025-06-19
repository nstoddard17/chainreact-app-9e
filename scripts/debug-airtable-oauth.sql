-- Debug Airtable OAuth issue
-- This script helps diagnose the "invalid_client" error

-- Check current time in UTC
SELECT NOW() as current_time_utc;

-- Show Airtable integration details
SELECT 
    id,
    provider,
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
ORDER BY created_at DESC;

-- Check if Airtable integration is expired
SELECT 
    provider,
    status,
    expires_at,
    CASE 
        WHEN expires_at IS NULL THEN 'No expiry'
        WHEN expires_at < NOW() THEN 'EXPIRED'
        WHEN expires_at < NOW() + INTERVAL '10 minutes' THEN 'Expiring soon'
        ELSE 'Valid'
    END as expiry_status,
    refresh_token IS NOT NULL as has_refresh_token,
    'Check OAuth credentials' as action_needed
FROM integrations 
WHERE provider = 'airtable'
ORDER BY created_at DESC;

-- Show recent Airtable token refresh attempts
SELECT 
    job_id,
    executed_at,
    status,
    error_count,
    errors
FROM token_refresh_logs 
WHERE errors::text LIKE '%airtable%'
ORDER BY executed_at DESC
LIMIT 5; 