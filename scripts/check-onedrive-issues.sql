-- Investigate OneDrive integration issues
-- Check the details of recently disconnected OneDrive integrations

SELECT 
  id,
  user_id,
  provider,
  status,
  expires_at,
  disconnected_at,
  disconnect_reason,
  consecutive_failures,
  last_failure_at,
  last_token_refresh,
  last_used_at,
  created_at,
  updated_at
FROM integrations 
WHERE provider = 'onedrive'
ORDER BY disconnected_at DESC;

-- Check if there are any OneDrive integrations that are still connected
SELECT 
  'connected_onedrive' as status,
  COUNT(*) as count
FROM integrations 
WHERE provider = 'onedrive' 
  AND status = 'connected';

-- Check for any OneDrive integrations with failures
SELECT 
  'failed_onedrive' as status,
  COUNT(*) as count,
  STRING_AGG(disconnect_reason, '; ') as reasons
FROM integrations 
WHERE provider = 'onedrive' 
  AND consecutive_failures > 0;

-- Check recent OneDrive activity
SELECT 
  'recent_activity' as metric,
  COUNT(*) as total_onedrive,
  COUNT(*) FILTER (WHERE disconnected_at > NOW() - INTERVAL '7 days') as disconnected_this_week,
  COUNT(*) FILTER (WHERE last_used_at > NOW() - INTERVAL '7 days') as used_this_week,
  COUNT(*) FILTER (WHERE last_token_refresh > NOW() - INTERVAL '7 days') as refreshed_this_week
FROM integrations 
WHERE provider = 'onedrive'; 