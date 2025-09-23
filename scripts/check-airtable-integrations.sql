-- Check for Airtable integrations for your user
-- Run this in Supabase SQL editor

SELECT
  id,
  provider,
  status,
  created_at,
  updated_at,
  metadata,
  -- Don't show the actual token, just check if it exists
  CASE WHEN access_token IS NOT NULL THEN 'Has Token' ELSE 'No Token' END as token_status
FROM integrations
WHERE user_id = 'a3e3a51a-175c-4b59-ad03-227ba12a18b0'
  AND provider = 'airtable'
ORDER BY created_at DESC;

-- Also check what scopes might be stored in metadata
SELECT
  id,
  metadata->>'scopes' as scopes,
  created_at,
  updated_at
FROM integrations
WHERE user_id = 'a3e3a51a-175c-4b59-ad03-227ba12a18b0'
  AND provider = 'airtable'
  AND status = 'connected';