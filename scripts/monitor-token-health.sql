-- Monitor token health and expiration status

-- Check tokens that are expiring soon (within 24 hours)
SELECT 
  provider,
  user_id,
  expires_at,
  last_token_refresh,
  consecutive_failures,
  CASE 
    WHEN expires_at IS NULL THEN 'No expiration set'
    WHEN expires_at < NOW() THEN 'EXPIRED ⚠️'
    WHEN expires_at < NOW() + INTERVAL '1 hour' THEN 'Expires within 1 hour 🔴'
    WHEN expires_at < NOW() + INTERVAL '6 hours' THEN 'Expires within 6 hours 🟡'
    WHEN expires_at < NOW() + INTERVAL '24 hours' THEN 'Expires within 24 hours 🟠'
    ELSE 'Healthy ✅'
  END as health_status,
  EXTRACT(EPOCH FROM (expires_at - NOW()))/3600 as hours_until_expiry
FROM integrations 
WHERE status = 'connected'
ORDER BY expires_at ASC NULLS LAST;

-- Check refresh success rate by provider
SELECT 
  provider,
  COUNT(*) as total_integrations,
  COUNT(CASE WHEN consecutive_failures = 0 THEN 1 END) as healthy_tokens,
  COUNT(CASE WHEN consecutive_failures > 0 THEN 1 END) as failing_tokens,
  AVG(consecutive_failures) as avg_failures,
  MAX(last_token_refresh) as last_successful_refresh
FROM integrations 
WHERE status = 'connected'
GROUP BY provider
ORDER BY failing_tokens DESC, provider;

-- Recent refresh activity
SELECT 
  executed_at,
  total_processed,
  successful_refreshes,
  failed_refreshes,
  skipped_refreshes,
  ROUND((successful_refreshes::float / NULLIF(total_processed, 0)) * 100, 2) as success_rate_percent,
  duration_ms,
  error_count
FROM token_refresh_logs 
ORDER BY executed_at DESC 
LIMIT 20;
