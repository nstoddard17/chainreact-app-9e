-- Check expired integrations with a temporary status column
-- This query adds a computed column showing the actual status vs expiry status
-- Based on the actual integrations table schema

SELECT 
  id,
  user_id,
  provider,
  status as db_status,
  expires_at,
  last_token_refresh,
  consecutive_failures,
  last_failure_at,
  disconnected_at,
  disconnect_reason,
  is_active,
  CASE 
    WHEN status = 'connected' AND expires_at IS NULL THEN 'connected'
    WHEN status = 'connected' AND expires_at <= NOW() THEN 'expired'
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '30 minutes' THEN 'expiring'
    WHEN status = 'connected' THEN 'connected'
    WHEN status = 'expired' THEN 'expired'
    WHEN status = 'disconnected' THEN 'disconnected'
    WHEN status = 'needs_reauthorization' THEN 'needs_reauthorization'
    ELSE status
  END as display_status,
  CASE 
    WHEN expires_at IS NULL THEN NULL
    ELSE expires_at - NOW()
  END as time_until_expiry,
  CASE
    WHEN consecutive_failures > 0 THEN 'has_failures'
    ELSE 'no_failures'
  END as failure_status,
  created_at,
  updated_at
FROM integrations 
ORDER BY 
  CASE 
    WHEN status = 'connected' AND expires_at IS NULL THEN 3
    WHEN status = 'connected' AND expires_at <= NOW() THEN 0
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '30 minutes' THEN 1
    WHEN status = 'connected' THEN 2
    WHEN status = 'expired' THEN 0
    WHEN status = 'disconnected' THEN 4
    WHEN status = 'needs_reauthorization' THEN 5
    ELSE 6
  END,
  expires_at ASC;

-- Summary count by display status
SELECT 
  display_status,
  COUNT(*) as count,
  STRING_AGG(provider, ', ') as providers
FROM (
  SELECT 
    provider,
    CASE 
      WHEN status = 'connected' AND expires_at IS NULL THEN 'connected'
      WHEN status = 'connected' AND expires_at <= NOW() THEN 'expired'
      WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '30 minutes' THEN 'expiring'
      WHEN status = 'connected' THEN 'connected'
      WHEN status = 'expired' THEN 'expired'
      WHEN status = 'disconnected' THEN 'disconnected'
      WHEN status = 'needs_reauthorization' THEN 'needs_reauthorization'
      ELSE status
    END as display_status
  FROM integrations
) subquery
GROUP BY display_status
ORDER BY 
  CASE 
    WHEN display_status = 'expired' THEN 0
    WHEN display_status = 'expiring' THEN 1
    WHEN display_status = 'connected' THEN 2
    WHEN display_status = 'disconnected' THEN 3
    WHEN display_status = 'needs_reauthorization' THEN 4
    ELSE 5
  END;

-- Additional diagnostic queries
-- Check for integrations with consecutive failures
SELECT 
  'consecutive_failures' as issue_type,
  COUNT(*) as count,
  STRING_AGG(provider, ', ') as providers
FROM integrations 
WHERE consecutive_failures > 0
GROUP BY issue_type;

-- Check for recently disconnected integrations
SELECT 
  'recently_disconnected' as issue_type,
  COUNT(*) as count,
  STRING_AGG(provider, ', ') as providers
FROM integrations 
WHERE disconnected_at IS NOT NULL 
  AND disconnected_at > NOW() - INTERVAL '7 days'
GROUP BY issue_type;

-- Check for inactive integrations
SELECT 
  'inactive' as issue_type,
  COUNT(*) as count,
  STRING_AGG(provider, ', ') as providers
FROM integrations 
WHERE is_active = false
GROUP BY issue_type; 