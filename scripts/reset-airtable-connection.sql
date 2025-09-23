-- Script to fully reset Airtable connection
-- Run this in Supabase SQL editor before reconnecting

-- 1. Delete existing Airtable integration
DELETE FROM integrations
WHERE user_id = 'a3e3a51a-175c-4b59-ad03-227ba12a18b0'
  AND provider = 'airtable';

-- 2. Delete any Airtable webhook records
DELETE FROM airtable_webhooks
WHERE user_id = 'a3e3a51a-175c-4b59-ad03-227ba12a18b0';

-- 3. Delete any webhook triggers for Airtable
DELETE FROM webhook_triggers
WHERE user_id = 'a3e3a51a-175c-4b59-ad03-227ba12a18b0'
  AND provider_id = 'airtable';

-- 4. Delete any webhook configs for Airtable
DELETE FROM webhook_configs
WHERE user_id = 'a3e3a51a-175c-4b59-ad03-227ba12a18b0'
  AND provider_id = 'airtable';

-- 5. Check if deleted successfully
SELECT
  'Integrations' as table_name,
  COUNT(*) as remaining_records
FROM integrations
WHERE user_id = 'a3e3a51a-175c-4b59-ad03-227ba12a18b0'
  AND provider = 'airtable'

UNION ALL

SELECT
  'Airtable Webhooks' as table_name,
  COUNT(*) as remaining_records
FROM airtable_webhooks
WHERE user_id = 'a3e3a51a-175c-4b59-ad03-227ba12a18b0';

-- Should show 0 remaining records for both tables