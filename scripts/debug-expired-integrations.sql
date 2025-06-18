-- Debug expired integrations issue
-- This script will help understand why expired integrations aren't being picked up

-- 1. Check all expired integrations
SELECT 
  id,
  provider,
  user_id,
  status,
  expires_at,
  refresh_token IS NOT NULL as has_refresh_token,
  updated_at,
  created_at
FROM integrations 
WHERE status = 'expired'
ORDER BY updated_at DESC;

-- 2. Check what the UI would show for these integrations
SELECT 
  id,
  provider,
  status as db_status,
  expires_at,
  CASE 
    WHEN status = 'expired' THEN 'expired'
    WHEN status = 'connected' AND expires_at IS NULL THEN 'connected'
    WHEN status = 'connected' AND expires_at <= NOW() THEN 'expired'
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '10 minutes' THEN 'expiring'
    WHEN status = 'connected' THEN 'connected'
    WHEN status = 'disconnected' THEN 'disconnected'
    WHEN status = 'needs_reauthorization' THEN 'needs_reauthorization'
    ELSE status
  END as ui_status,
  refresh_token IS NOT NULL as has_refresh_token
FROM integrations 
WHERE status = 'expired'
ORDER BY updated_at DESC;

-- 3. Check integrations that should be expired but aren't marked as such
SELECT 
  id,
  provider,
  status,
  expires_at,
  expires_at - NOW() as time_since_expiry,
  refresh_token IS NOT NULL as has_refresh_token
FROM integrations 
WHERE status = 'connected' 
  AND expires_at IS NOT NULL 
  AND expires_at <= NOW()
ORDER BY expires_at ASC;

-- 4. Summary counts
SELECT 
  'Database Status' as source,
  status,
  COUNT(*) as count
FROM integrations 
GROUP BY status

UNION ALL

SELECT 
  'UI Calculation' as source,
  CASE 
    WHEN status = 'expired' THEN 'expired'
    WHEN status = 'connected' AND expires_at IS NULL THEN 'connected'
    WHEN status = 'connected' AND expires_at <= NOW() THEN 'expired'
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '10 minutes' THEN 'expiring'
    WHEN status = 'connected' THEN 'connected'
    WHEN status = 'disconnected' THEN 'disconnected'
    WHEN status = 'needs_reauthorization' THEN 'needs_reauthorization'
    ELSE status
  END as status,
  COUNT(*) as count
FROM integrations 
GROUP BY 
  CASE 
    WHEN status = 'expired' THEN 'expired'
    WHEN status = 'connected' AND expires_at IS NULL THEN 'connected'
    WHEN status = 'connected' AND expires_at <= NOW() THEN 'expired'
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '10 minutes' THEN 'expiring'
    WHEN status = 'connected' THEN 'connected'
    WHEN status = 'disconnected' THEN 'disconnected'
    WHEN status = 'needs_reauthorization' THEN 'needs_reauthorization'
    ELSE status
  END
ORDER BY source, status; 