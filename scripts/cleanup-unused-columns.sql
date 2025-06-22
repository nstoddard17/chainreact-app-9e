-- Remove unused columns from integrations table
-- This script removes columns that are defined but not actually used in the application

-- Remove last_refreshed_at (unused - only in schema)
ALTER TABLE IF EXISTS integrations 
DROP COLUMN IF EXISTS last_refreshed_at;

-- Remove last_used_at (unused - only in monitoring scripts)
ALTER TABLE IF EXISTS integrations 
DROP COLUMN IF EXISTS last_used_at;

-- Remove OAuth 1.0a columns (unused - no OAuth 1.0a implementations)
ALTER TABLE IF EXISTS integrations 
DROP COLUMN IF EXISTS token;

ALTER TABLE IF EXISTS integrations 
DROP COLUMN IF EXISTS token_secret;

-- Remove api_key column (unused - API keys are in separate table)
ALTER TABLE IF EXISTS integrations 
DROP COLUMN IF EXISTS api_key;

-- Verify the cleanup
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'integrations' 
ORDER BY ordinal_position;

-- Show remaining columns that are actually used
SELECT 
    'Remaining columns:' as info,
    string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns 
WHERE table_name = 'integrations';
