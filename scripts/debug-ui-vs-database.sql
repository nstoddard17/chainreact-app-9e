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
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '10 minutes' THEN 'expiring'
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
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '10 minutes' THEN 'expiring'
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
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '10 minutes' THEN 'expiring'
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
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '10 minutes' THEN 'expiring'
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
    WHEN status = 'connected' AND expires_at <= NOW() + INTERVAL '10 minutes' THEN 'expiring'
    WHEN status = 'connected' THEN 'connected'
    WHEN status = 'expired' AND expires_at <= NOW() THEN 'expired'
    WHEN status = 'disconnected' THEN 'disconnected'
    WHEN status = 'needs_reauthorization' THEN 'needs_reauthorization'
    ELSE status
  END
ORDER BY source, status_type;

-- Debug script to show the exact difference between database status and UI calculation
-- This will help identify why there's confusion between UI and database

-- Check current time in UTC
SELECT NOW() as current_time_utc;

-- Show all integrations with their database status and what the UI would calculate
WITH ui_calculation AS (
  SELECT 
    id,
    provider,
    user_id,
    -- Database status
    status as db_status,
    expires_at,
    refresh_token IS NOT NULL as has_refresh_token,
    disconnected_at,
    disconnect_reason,
    -- UI calculation logic (matching the TypeScript code)
    CASE 
      WHEN status = 'needs_reauthorization' THEN 'needs_reauthorization'
      WHEN status = 'expired' THEN 'expired'
      WHEN status = 'connected' THEN
        CASE 
          WHEN expires_at IS NULL THEN 'connected'
          WHEN expires_at < NOW() THEN 'expired'
          WHEN expires_at < NOW() + INTERVAL '10 minutes' THEN 'expiring'
          ELSE 'connected'
        END
      WHEN status = 'disconnected' THEN 'disconnected'
      ELSE 'disconnected'
    END as ui_calculated_status,
    -- Additional UI logic for expiring status
    CASE 
      WHEN status = 'connected' AND expires_at IS NOT NULL 
      AND expires_at < NOW() + INTERVAL '10 minutes' 
      AND expires_at > NOW() THEN 'expiring'
      ELSE NULL
    END as ui_expiring_status
  FROM integrations 
  WHERE user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
)
SELECT 
  provider,
  db_status,
  ui_calculated_status,
  ui_expiring_status,
  expires_at,
  has_refresh_token,
  disconnected_at IS NOT NULL as has_disconnected_at,
  disconnect_reason,
  -- Show if there's a mismatch
  CASE 
    WHEN db_status != ui_calculated_status THEN 'MISMATCH'
    WHEN ui_expiring_status IS NOT NULL THEN 'UI_SHOWS_EXPIRING'
    ELSE 'MATCH'
  END as status_check
FROM ui_calculation
ORDER BY 
  CASE WHEN db_status != ui_calculated_status THEN 0 ELSE 1 END,
  provider;

-- Show integrations that the UI would show as "needs re-authorization"
SELECT 
  provider,
  db_status,
  ui_calculated_status,
  expires_at,
  has_refresh_token,
  'UI_WOULD_SHOW_NEEDS_REAUTH' as reason
FROM (
  SELECT 
    id,
    provider,
    status as db_status,
    expires_at,
    refresh_token IS NOT NULL as has_refresh_token,
    CASE 
      WHEN status = 'needs_reauthorization' THEN 'needs_reauthorization'
      WHEN status = 'expired' THEN 'expired'
      WHEN status = 'connected' THEN
        CASE 
          WHEN expires_at IS NULL THEN 'connected'
          WHEN expires_at < NOW() THEN 'expired'
          WHEN expires_at < NOW() + INTERVAL '10 minutes' THEN 'expiring'
          ELSE 'connected'
        END
      WHEN status = 'disconnected' THEN 'disconnected'
      ELSE 'disconnected'
    END as ui_calculated_status
  FROM integrations 
  WHERE user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
) calc
WHERE ui_calculated_status = 'needs_reauthorization'
ORDER BY provider;

-- Show integrations that have disconnected_at set but might be valid
SELECT 
  provider,
  status,
  expires_at,
  refresh_token IS NOT NULL as has_refresh_token,
  disconnected_at,
  disconnect_reason,
  'HAS_DISCONNECTED_AT_BUT_MIGHT_BE_VALID' as reason
FROM integrations 
WHERE user_id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008'
  AND disconnected_at IS NOT NULL
  AND access_token IS NOT NULL
  AND access_token != ''
  AND (
    (refresh_token IS NOT NULL AND refresh_token != '')
    OR 
    expires_at IS NULL
  )
ORDER BY provider;
