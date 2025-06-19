-- Check which integrations are actually expired vs incorrectly marked
-- This helps identify the real vs false "needs re-authorization" cases

-- Check current time in UTC
SELECT NOW() as current_time_utc;

-- Show all integrations with their expiry status
SELECT 
    provider,
    status,
    expires_at,
    CASE 
        WHEN expires_at IS NULL THEN 'No expiry (API key)'
        WHEN expires_at < NOW() THEN 'EXPIRED'
        WHEN expires_at < NOW() + INTERVAL '10 minutes' THEN 'Expiring soon'
        ELSE 'Valid'
    END as expiry_status,
    refresh_token IS NOT NULL as has_refresh_token,
    disconnected_at,
    disconnect_reason,
    CASE 
        WHEN expires_at IS NULL THEN 'API Key - No reauth needed'
        WHEN expires_at < NOW() AND refresh_token IS NULL THEN 'EXPIRED - Needs reauth'
        WHEN expires_at < NOW() AND refresh_token IS NOT NULL THEN 'EXPIRED - Can refresh'
        WHEN disconnected_at IS NOT NULL THEN 'Marked disconnected - Check if valid'
        ELSE 'Valid'
    END as reauth_needed
FROM integrations 
WHERE user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
ORDER BY 
    CASE WHEN expires_at < NOW() THEN 0 ELSE 1 END,
    provider;

-- Show integrations that are actually expired and need re-authorization
SELECT 
    provider,
    expires_at,
    'ACTUALLY EXPIRED - Needs re-authorization' as reason
FROM integrations 
WHERE 
    user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
    AND expires_at IS NOT NULL
    AND expires_at < NOW()
    AND refresh_token IS NULL;

-- Show integrations that are expired but can be refreshed
SELECT 
    provider,
    expires_at,
    'EXPIRED - Can be refreshed' as reason
FROM integrations 
WHERE 
    user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
    AND expires_at IS NOT NULL
    AND expires_at < NOW()
    AND refresh_token IS NOT NULL;

-- Show integrations that were incorrectly marked as disconnected
SELECT 
    provider,
    expires_at,
    refresh_token IS NOT NULL as has_refresh_token,
    'INCORRECTLY MARKED - Should be connected' as reason
FROM integrations 
WHERE 
    user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
    AND access_token IS NOT NULL
    AND access_token != ''
    AND (
        (refresh_token IS NOT NULL AND refresh_token != '')
        OR 
        expires_at IS NULL
    )
    AND disconnected_at IS NOT NULL; 