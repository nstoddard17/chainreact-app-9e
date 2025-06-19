-- Check for duplicate integrations across all providers
-- This helps identify any duplicate integrations that might be causing issues

-- Show all duplicate integrations by user and provider
WITH duplicate_check AS (
  SELECT 
    user_id,
    provider,
    COUNT(*) as integration_count,
    array_agg(id ORDER BY updated_at DESC) as integration_ids,
    array_agg(status ORDER BY updated_at DESC) as statuses,
    array_agg(updated_at ORDER BY updated_at DESC) as updated_times
  FROM integrations 
  GROUP BY user_id, provider
  HAVING COUNT(*) > 1
)
SELECT 
    'Duplicate Integrations Found' as info,
    user_id,
    provider,
    integration_count,
    integration_ids[1] as most_recent_id,
    statuses[1] as most_recent_status,
    updated_times[1] as most_recent_update,
    integration_ids[2:] as older_ids,
    statuses[2:] as older_statuses
FROM duplicate_check
ORDER BY user_id, provider;

-- Show detailed info for Airtable duplicates specifically
SELECT 
    'Airtable Duplicate Details' as info,
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
  AND user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
ORDER BY updated_at DESC;

-- Show which integration should be kept (most recent valid one)
SELECT 
    'Recommended Action for Airtable' as info,
    id,
    status,
    expires_at,
    refresh_token IS NOT NULL as has_refresh_token,
    created_at,
    updated_at,
    CASE 
        WHEN ROW_NUMBER() OVER (ORDER BY updated_at DESC) = 1 THEN 'KEEP - Most recent'
        ELSE 'DELETE - Duplicate'
    END as action
FROM integrations 
WHERE provider = 'airtable' 
  AND user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
ORDER BY updated_at DESC;

-- Count integrations by provider for this user
SELECT 
    'Integration Count by Provider' as info,
    provider,
    COUNT(*) as count,
    array_agg(status) as statuses
FROM integrations 
WHERE user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
GROUP BY provider
ORDER BY count DESC, provider; 