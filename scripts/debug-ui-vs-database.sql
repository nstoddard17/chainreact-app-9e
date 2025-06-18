-- Debug UI vs Database Discrepancy
-- This script will help understand why the UI shows 14 expired but database shows 8

-- 1. Check what the database actually stores
SELECT 
  'database_status' as source,
  status as db_status,
  COUNT(*) as count
FROM integrations 
GROUP BY status
ORDER BY count DESC;

-- 2. Check what the UI would calculate (based on the logic in IntegrationsContent.tsx)
SELECT 
  'ui_calculation' as source,
  CASE 
    WHEN status = 'connected' AND expires_at IS NULL THEN 'connected'
    WHEN status = 'connected' AND expires_at <= NOW() THEN 'expired'
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '30 minutes' THEN 'expiring'
    WHEN status = 'connected' THEN 'connected'
    WHEN status = 'expired' THEN 'expired'
    WHEN status = 'disconnected' THEN 'disconnected'
    WHEN status = 'needs_reauthorization' THEN 'needs_reauthorization'
    ELSE status
  END as ui_status,
  COUNT(*) as count
FROM integrations 
GROUP BY 
  CASE 
    WHEN status = 'connected' AND expires_at IS NULL THEN 'connected'
    WHEN status = 'connected' AND expires_at <= NOW() THEN 'expired'
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '30 minutes' THEN 'expiring'
    WHEN status = 'connected' THEN 'connected'
    WHEN status = 'expired' THEN 'expired'
    WHEN status = 'disconnected' THEN 'disconnected'
    WHEN status = 'needs_reauthorization' THEN 'needs_reauthorization'
    ELSE status
  END
ORDER BY count DESC;

-- 3. Show the specific integrations that the UI considers "expired"
SELECT 
  id,
  provider,
  status as db_status,
  expires_at,
  CASE 
    WHEN status = 'connected' AND expires_at IS NULL THEN 'connected'
    WHEN status = 'connected' AND expires_at <= NOW() THEN 'expired'
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '30 minutes' THEN 'expiring'
    WHEN status = 'connected' THEN 'connected'
    WHEN status = 'expired' THEN 'expired'
    WHEN status = 'disconnected' THEN 'disconnected'
    WHEN status = 'needs_reauthorization' THEN 'needs_reauthorization'
    ELSE status
  END as ui_status,
  expires_at - NOW() as time_until_expiry
FROM integrations 
WHERE 
  -- UI considers these "expired"
  (status = 'connected' AND expires_at <= NOW()) OR
  (status = 'expired')
ORDER BY expires_at ASC;

-- 4. Check for any integrations that might be counted twice or have issues
SELECT 
  'potential_issues' as check_type,
  COUNT(*) as count,
  STRING_AGG(provider || ' (' || status || ')', ', ') as details
FROM integrations 
WHERE 
  -- These should be marked as expired but aren't
  status = 'connected' AND expires_at <= NOW();

-- 5. Summary comparison
SELECT 
  'summary' as type,
  'Database Status' as source,
  status as status_type,
  COUNT(*) as count
FROM integrations 
GROUP BY status

UNION ALL

SELECT 
  'summary' as type,
  'UI Calculation' as source,
  CASE 
    WHEN status = 'connected' AND expires_at IS NULL THEN 'connected'
    WHEN status = 'connected' AND expires_at <= NOW() THEN 'expired'
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '30 minutes' THEN 'expiring'
    WHEN status = 'connected' THEN 'connected'
    WHEN status = 'expired' THEN 'expired'
    WHEN status = 'disconnected' THEN 'disconnected'
    WHEN status = 'needs_reauthorization' THEN 'needs_reauthorization'
    ELSE status
  END as status_type,
  COUNT(*) as count
FROM integrations 
GROUP BY 
  CASE 
    WHEN status = 'connected' AND expires_at IS NULL THEN 'connected'
    WHEN status = 'connected' AND expires_at <= NOW() THEN 'expired'
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '30 minutes' THEN 'expiring'
    WHEN status = 'connected' THEN 'connected'
    WHEN status = 'expired' AND expires_at <= NOW() THEN 'expired'
    WHEN status = 'disconnected' THEN 'disconnected'
    WHEN status = 'needs_reauthorization' THEN 'needs_reauthorization'
    ELSE status
  END
ORDER BY source, status_type; 