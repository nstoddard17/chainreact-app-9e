-- Fix duplicate Airtable integrations
-- This script identifies and resolves duplicate integrations for the same user

-- First, show all Airtable integrations for the user
SELECT 
    'All Airtable Integrations' as info,
    id,
    provider,
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
  AND user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
ORDER BY created_at DESC;

-- Show which integration is the most recent and valid
SELECT 
    'Integration Analysis' as info,
    id,
    status,
    expires_at,
    refresh_token IS NOT NULL as has_refresh_token,
    access_token IS NOT NULL as has_access_token,
    created_at,
    updated_at,
    CASE 
        WHEN status = 'connected' AND expires_at > NOW() THEN 'KEEP - Valid and current'
        WHEN status = 'expired' AND refresh_token IS NOT NULL THEN 'KEEP - Can be refreshed'
        WHEN status = 'expired' AND refresh_token IS NULL THEN 'DELETE - No refresh token'
        ELSE 'REVIEW - Check manually'
    END as recommendation
FROM integrations 
WHERE provider = 'airtable' 
  AND user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
ORDER BY updated_at DESC;

-- Keep the most recent valid integration and delete the older one
-- This will keep the "connected" one and delete the "expired" one
WITH ranked_integrations AS (
  SELECT 
    id,
    status,
    expires_at,
    refresh_token IS NOT NULL as has_refresh_token,
    access_token IS NOT NULL as has_access_token,
    created_at,
    updated_at,
    ROW_NUMBER() OVER (ORDER BY updated_at DESC) as rn
  FROM integrations 
  WHERE provider = 'airtable' 
    AND user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
)
SELECT 
    'Integration to DELETE' as action,
    id,
    status,
    expires_at,
    has_refresh_token,
    created_at,
    updated_at
FROM ranked_integrations 
WHERE rn > 1; -- Keep the first (most recent), delete the rest

-- Actually delete the duplicate (run this after reviewing the above)
-- DELETE FROM integrations 
-- WHERE id IN (
--   SELECT id FROM (
--     SELECT 
--       id,
--       ROW_NUMBER() OVER (ORDER BY updated_at DESC) as rn
--     FROM integrations 
--     WHERE provider = 'airtable' 
--       AND user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
--   ) ranked
--   WHERE rn > 1
-- );

-- Verify the cleanup
SELECT 
    'After Cleanup' as info,
    provider,
    status,
    expires_at,
    refresh_token IS NOT NULL as has_refresh_token,
    created_at,
    updated_at
FROM integrations 
WHERE provider = 'airtable' 
  AND user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
ORDER BY updated_at DESC; 