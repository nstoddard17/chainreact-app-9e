-- Direct SQL cleanup for corrupted tokens
-- Run this in your database management tool (e.g., Supabase SQL Editor)

-- Step 1: Create a temporary table to track changes
CREATE TEMP TABLE token_cleanup_log (
  integration_id UUID,
  provider TEXT,
  user_id UUID,
  old_status TEXT,
  reason TEXT
);

-- Step 2: Update all problematic integrations

-- Update Box, YouTube Studio, and Discord integrations
UPDATE integrations
SET 
  status = 'needs_reauthorization',
  updated_at = NOW(),
  disconnect_reason = 'Token cleanup: Known problematic provider'
WHERE 
  provider IN ('box', 'youtube-studio', 'discord')
  AND status != 'needs_reauthorization';

-- Update integrations with specific token lengths that are causing issues
UPDATE integrations
SET 
  status = 'needs_reauthorization',
  updated_at = NOW(),
  disconnect_reason = 'Token cleanup: Problematic token length'
WHERE 
  refresh_token IS NOT NULL
  AND (LENGTH(refresh_token) = 29 OR LENGTH(refresh_token) = 56)
  AND status != 'needs_reauthorization';

-- Step 3: Report results
SELECT provider, COUNT(*) 
FROM integrations 
WHERE status = 'needs_reauthorization' 
GROUP BY provider 
ORDER BY COUNT(*) DESC; 