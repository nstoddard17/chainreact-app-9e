-- Ensure the access_token field can store large Microsoft tokens
-- Microsoft tokens can be quite long (1000+ characters)

ALTER TABLE integrations 
ALTER COLUMN access_token TYPE TEXT;

-- Also ensure refresh_token can store long tokens
ALTER TABLE integrations 
ALTER COLUMN refresh_token TYPE TEXT;

-- Add an index for better performance on token lookups
CREATE INDEX IF NOT EXISTS idx_integrations_provider_user 
ON integrations(provider, user_id) 
WHERE status = 'connected';

-- Check current Teams integrations for token issues
SELECT 
  id,
  provider,
  user_id,
  LENGTH(access_token) as token_length,
  LEFT(access_token, 20) as token_start,
  status,
  created_at
FROM integrations 
WHERE provider = 'teams' 
AND status = 'connected'
ORDER BY created_at DESC;
