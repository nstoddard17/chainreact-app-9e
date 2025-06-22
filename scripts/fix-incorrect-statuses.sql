-- Fix incorrect statuses in integrations table
-- This script clears the disconnected_at and disconnect_reason fields for integrations
-- that have valid tokens and shouldn't need re-authorization

-- First, let's see what we're working with
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

-- Fix integrations that have valid tokens but were incorrectly marked as disconnected
-- Clear disconnected_at and disconnect_reason for integrations that:
-- 1. Have a valid access_token
-- 2. Have a refresh_token (or no expiry date for API key integrations)
-- 3. Are currently marked as 'connected' but have disconnected_at set

UPDATE integrations 
SET 
    disconnected_at = NULL,
    disconnect_reason = NULL,
    status = 'connected'
WHERE 
    user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
    AND access_token IS NOT NULL 
    AND access_token != ''
    AND (
        -- For OAuth integrations: have refresh token or no expiry
        (refresh_token IS NOT NULL AND refresh_token != '') 
        OR 
        -- For API key integrations: no expiry date
        expires_at IS NULL
    )
    AND disconnected_at IS NOT NULL;

-- Also fix any integrations that might have incorrect status
UPDATE integrations 
SET status = 'connected'
WHERE 
    user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
    AND access_token IS NOT NULL 
    AND access_token != ''
    AND status IN ('expired', 'needs_reauthorization')
    AND (
        (refresh_token IS NOT NULL AND refresh_token != '') 
        OR 
        expires_at IS NULL
    );

-- Show the results after cleanup
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

-- Count by status
SELECT 
    status,
    COUNT(*) as count
FROM integrations 
WHERE user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
GROUP BY status
ORDER BY count DESC;
