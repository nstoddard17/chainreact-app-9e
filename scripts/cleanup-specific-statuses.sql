-- Clean up specific incorrect statuses based on the user's data
-- This targets the specific integrations that are showing "needs re-authorization"

-- 1. Fix Teams integration - has valid token but was marked as needing re-auth
UPDATE integrations 
SET 
    disconnected_at = NULL,
    disconnect_reason = NULL,
    status = 'connected'
WHERE 
    user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
    AND provider = 'teams'
    AND access_token IS NOT NULL
    AND refresh_token IS NOT NULL;

-- 2. Fix OneDrive integration - has valid token but was marked as needing re-auth  
UPDATE integrations 
SET 
    disconnected_at = NULL,
    disconnect_reason = NULL,
    status = 'connected'
WHERE 
    user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
    AND provider = 'onedrive'
    AND access_token IS NOT NULL
    AND refresh_token IS NOT NULL;

-- 3. Fix any other integrations that have valid tokens but incorrect status
UPDATE integrations 
SET 
    disconnected_at = NULL,
    disconnect_reason = NULL,
    status = 'connected'
WHERE 
    user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
    AND access_token IS NOT NULL 
    AND access_token != ''
    AND refresh_token IS NOT NULL
    AND refresh_token != ''
    AND disconnected_at IS NOT NULL;

-- 4. Fix integrations that might have expired status but valid refresh tokens
UPDATE integrations 
SET status = 'connected'
WHERE 
    user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
    AND access_token IS NOT NULL 
    AND access_token != ''
    AND refresh_token IS NOT NULL
    AND refresh_token != ''
    AND status IN ('expired', 'needs_reauthorization');

-- Show the results
SELECT 
    provider,
    status,
    expires_at,
    refresh_token IS NOT NULL as has_refresh_token,
    disconnected_at,
    disconnect_reason
FROM integrations 
WHERE user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
ORDER BY provider;

-- Count by status after cleanup
SELECT 
    status,
    COUNT(*) as count
FROM integrations 
WHERE user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
GROUP BY status
ORDER BY count DESC; 