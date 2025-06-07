-- Ensure the access_token column is large enough for Microsoft tokens
ALTER TABLE IF EXISTS integrations 
ALTER COLUMN access_token TYPE TEXT;

-- Ensure the refresh_token column is large enough
ALTER TABLE IF EXISTS integrations 
ALTER COLUMN refresh_token TYPE TEXT;

-- Update any existing Teams integrations to use the metadata access_token as a backup
UPDATE integrations
SET access_token = metadata->>'access_token'
WHERE provider = 'teams' 
AND (access_token IS NULL OR access_token = '') 
AND metadata->>'access_token' IS NOT NULL;

-- Set status to 'disconnected' for any Teams integrations with invalid tokens
UPDATE integrations
SET status = 'disconnected'
WHERE provider = 'teams'
AND (access_token IS NULL OR access_token = '' OR length(access_token) < 50)
AND status = 'connected';
