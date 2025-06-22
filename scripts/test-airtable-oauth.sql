-- Test Airtable OAuth credentials and integration status
-- This helps diagnose the "invalid_client" error

-- Check if Airtable integration exists and its current state
SELECT 
    'Airtable Integration Status' as info,
    provider,
    status,
    expires_at,
    refresh_token IS NOT NULL as has_refresh_token,
    access_token IS NOT NULL as has_access_token,
    created_at,
    updated_at
FROM integrations 
WHERE provider = 'airtable'
ORDER BY created_at DESC;

-- Check environment variables (this will show if they're set, not the actual values)
SELECT 
    'Environment Variables Check' as info,
    CASE 
        WHEN current_setting('app.NEXT_PUBLIC_AIRTABLE_CLIENT_ID', true) IS NOT NULL 
        THEN 'NEXT_PUBLIC_AIRTABLE_CLIENT_ID: SET'
        ELSE 'NEXT_PUBLIC_AIRTABLE_CLIENT_ID: NOT SET'
    END as client_id_status,
    CASE 
        WHEN current_setting('app.AIRTABLE_CLIENT_SECRET', true) IS NOT NULL 
        THEN 'AIRTABLE_CLIENT_SECRET: SET'
        ELSE 'AIRTABLE_CLIENT_SECRET: NOT SET'
    END as client_secret_status;

-- Show recent token refresh logs for Airtable
SELECT 
    'Recent Airtable Token Refresh Attempts' as info,
    job_id,
    executed_at,
    status,
    error_count,
    CASE 
        WHEN errors::text LIKE '%airtable%' THEN 'Contains Airtable errors'
        ELSE 'No Airtable errors'
    END as has_airtable_errors
FROM token_refresh_logs 
WHERE executed_at > NOW() - INTERVAL '24 hours'
ORDER BY executed_at DESC
LIMIT 10;

-- Check if Airtable integration needs attention
SELECT 
    'Airtable Integration Health' as info,
    provider,
    status,
    CASE 
        WHEN expires_at IS NULL THEN 'No expiry (should be fine)'
        WHEN expires_at < NOW() THEN 'EXPIRED'
        WHEN expires_at < NOW() + INTERVAL '10 minutes' THEN 'Expiring soon'
        ELSE 'Valid'
    END as expiry_status,
    CASE 
        WHEN refresh_token IS NULL THEN 'No refresh token - needs re-auth'
        ELSE 'Has refresh token - can be refreshed'
    END as refresh_capability,
    CASE 
        WHEN disconnected_at IS NOT NULL THEN 'Marked as disconnected'
        ELSE 'Not marked as disconnected'
    END as disconnect_status
FROM integrations 
WHERE provider = 'airtable';
