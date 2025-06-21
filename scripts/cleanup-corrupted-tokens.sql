-- Cleanup script for corrupted tokens
-- This script identifies and marks integrations with potentially corrupted tokens
-- as "needs_reauthorization" instead of "expired" or "disconnected"

-- Step 1: Create a temporary table to track changes
CREATE TEMP TABLE token_cleanup_log (
  integration_id UUID,
  provider TEXT,
  user_id UUID,
  old_status TEXT,
  reason TEXT
);

-- Step 2: Identify integrations with suspicious tokens
-- These patterns indicate potentially corrupted tokens:
-- - Very short refresh tokens (less than 20 chars)
-- - Tokens that don't match expected formats
-- - Tokens with invalid characters

-- Update integrations with suspiciously short tokens
WITH updated_integrations AS (
  UPDATE integrations
  SET 
    status = 'needs_reauthorization',
    updated_at = NOW(),
    disconnect_reason = 'Token cleanup: Suspiciously short token'
  WHERE 
    refresh_token IS NOT NULL 
    AND LENGTH(refresh_token) < 20
    AND status != 'needs_reauthorization'
  RETURNING id, provider, user_id, status
)
INSERT INTO token_cleanup_log (integration_id, provider, user_id, old_status, reason)
SELECT id, provider, user_id, status, 'Short token (< 20 chars)'
FROM updated_integrations;

-- Update integrations with invalid token format
WITH updated_integrations AS (
  UPDATE integrations
  SET 
    status = 'needs_reauthorization',
    updated_at = NOW(),
    disconnect_reason = 'Token cleanup: Invalid token format'
  WHERE 
    refresh_token IS NOT NULL 
    AND (
      -- Common patterns for corrupted tokens
      refresh_token LIKE '%undefined%'
      OR refresh_token LIKE '%null%'
      OR refresh_token LIKE '%[object%'
      OR LENGTH(refresh_token) < 32
    )
    AND status != 'needs_reauthorization'
  RETURNING id, provider, user_id, status
)
INSERT INTO token_cleanup_log (integration_id, provider, user_id, old_status, reason)
SELECT id, provider, user_id, status, 'Invalid token format'
FROM updated_integrations;

-- Step 3: Create notifications for affected users
-- Note: This assumes you have a function called create_token_expiry_notification
-- If you don't have this function, you can comment out this section

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT user_id, provider FROM token_cleanup_log
  LOOP
    BEGIN
      PERFORM create_token_expiry_notification(r.user_id, r.provider);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to create notification for user % and provider %', r.user_id, r.provider;
    END;
  END LOOP;
END $$;

-- Step 4: Report results
SELECT COUNT(*) AS total_fixed FROM token_cleanup_log;
SELECT provider, COUNT(*) AS count 
FROM token_cleanup_log 
GROUP BY provider 
ORDER BY count DESC;

-- Optional: View the detailed log
-- SELECT * FROM token_cleanup_log;

-- Cleanup
DROP TABLE token_cleanup_log; 