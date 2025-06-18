-- Comprehensive Integration Health Check
-- Uses all available columns from the integrations table schema

-- 1. Main health status with all relevant columns
SELECT 
  id,
  user_id,
  provider,
  status as db_status,
  is_active,
  expires_at,
  last_token_refresh,
  consecutive_failures,
  last_failure_at,
  disconnected_at,
  disconnect_reason,
  last_used_at,
  CASE 
    WHEN status = 'connected' AND expires_at IS NULL THEN 'connected'
    WHEN status = 'connected' AND expires_at <= NOW() THEN 'expired'
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '10 minutes' THEN 'expiring'
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
  CASE
    WHEN last_used_at IS NULL THEN 'never_used'
    WHEN last_used_at < NOW() - INTERVAL '30 days' THEN 'unused_30_days'
    WHEN last_used_at < NOW() - INTERVAL '7 days' THEN 'unused_7_days'
    ELSE 'recently_used'
  END as usage_status,
  created_at,
  updated_at
FROM integrations 
ORDER BY 
  CASE 
    WHEN status = 'connected' AND expires_at IS NULL THEN 3
    WHEN status = 'connected' AND expires_at <= NOW() THEN 0
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '10 minutes' THEN 1
    WHEN status = 'connected' THEN 2
    WHEN status = 'expired' THEN 0
    WHEN status = 'disconnected' THEN 4
    WHEN status = 'needs_reauthorization' THEN 5
    ELSE 6
  END,
  expires_at ASC;

-- 2. Summary by display status
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
      WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '10 minutes' THEN 'expiring'
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

-- 3. Issues summary
SELECT 
  issue_type,
  COUNT(*) as count,
  STRING_AGG(provider, ', ') as providers
FROM (
  -- Consecutive failures
  SELECT 'consecutive_failures' as issue_type, provider
  FROM integrations 
  WHERE consecutive_failures > 0
  
  UNION ALL
  
  -- Recently disconnected
  SELECT 'recently_disconnected' as issue_type, provider
  FROM integrations 
  WHERE disconnected_at IS NOT NULL 
    AND disconnected_at > NOW() - INTERVAL '7 days'
  
  UNION ALL
  
  -- Inactive integrations
  SELECT 'inactive' as issue_type, provider
  FROM integrations 
  WHERE is_active = false
  
  UNION ALL
  
  -- Never used
  SELECT 'never_used' as issue_type, provider
  FROM integrations 
  WHERE last_used_at IS NULL
    AND created_at < NOW() - INTERVAL '7 days'
  
  UNION ALL
  
  -- Not refreshed recently
  SELECT 'not_refreshed_recently' as issue_type, provider
  FROM integrations 
  WHERE last_token_refresh IS NULL
    AND created_at < NOW() - INTERVAL '7 days'
    AND status = 'connected'
) issues
GROUP BY issue_type
ORDER BY count DESC;

-- 4. Provider-specific health
SELECT 
  provider,
  COUNT(*) as total_integrations,
  COUNT(*) FILTER (WHERE status = 'connected') as connected,
  COUNT(*) FILTER (WHERE status = 'expired') as expired,
  COUNT(*) FILTER (WHERE status = 'disconnected') as disconnected,
  COUNT(*) FILTER (WHERE consecutive_failures > 0) as with_failures,
  COUNT(*) FILTER (WHERE is_active = false) as inactive,
  AVG(consecutive_failures) as avg_failures,
  MAX(last_used_at) as last_used_any
FROM integrations 
GROUP BY provider
ORDER BY total_integrations DESC, connected DESC;

-- 5. Quick health score
SELECT 
  'overall_health' as metric,
  COUNT(*) as total_integrations,
  COUNT(*) FILTER (WHERE status = 'connected' AND (expires_at IS NULL OR expires_at > NOW())) as healthy,
  COUNT(*) FILTER (WHERE status = 'connected' AND expires_at <= NOW()) as expired_but_connected,
  COUNT(*) FILTER (WHERE status = 'expired') as expired_status,
  COUNT(*) FILTER (WHERE status = 'disconnected') as disconnected,
  COUNT(*) FILTER (WHERE consecutive_failures > 0) as with_failures,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'connected' AND (expires_at IS NULL OR expires_at > NOW()))::numeric / COUNT(*)::numeric) * 100, 
    1
  ) as health_percentage
FROM integrations; 