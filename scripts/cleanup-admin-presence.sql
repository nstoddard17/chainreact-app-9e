-- Cleanup script to remove admin presence table
-- Since we're using user_presence for all users instead

-- Drop the admin_presence table
DROP TABLE IF EXISTS admin_presence;

-- Verify cleanup
SELECT 
  'Tables' as object_type,
  table_name
FROM information_schema.tables 
WHERE table_name = 'admin_presence'; 