-- Fix YouTube integrations that might be in an incorrect state
UPDATE integrations
SET status = 'connected'
WHERE provider = 'youtube' 
AND access_token IS NOT NULL 
AND status != 'connected';

-- Add any missing metadata fields
UPDATE integrations
SET metadata = COALESCE(metadata, '{}')::jsonb || '{"connected_at": updated_at}'::jsonb
WHERE provider = 'youtube' 
AND (metadata IS NULL OR NOT metadata ? 'connected_at');

-- Log the update for verification
SELECT id, provider, status, updated_at
FROM integrations
WHERE provider = 'youtube';
