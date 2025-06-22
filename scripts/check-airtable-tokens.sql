-- Check Airtable integrations status
SELECT 
  id,
  user_id,
  provider,
  status,
  consecutive_failures,
  last_refresh_attempt,
  last_refresh_success,
  expires_at,
  updated_at,
  created_at,
  LEFT(access_token, 20) as access_token_preview,
  LEFT(refresh_token, 20) as refresh_token_preview,
  error_message
FROM 
  integrations
WHERE 
  provider = 'airtable'
ORDER BY 
  updated_at DESC
LIMIT 10;

-- Check recent Airtable refresh logs
SELECT 
  *
FROM 
  integration_logs
WHERE 
  provider = 'airtable'
  AND event_type LIKE '%token%'
ORDER BY 
  created_at DESC
LIMIT 10; 