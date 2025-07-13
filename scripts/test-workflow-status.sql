-- Test script for workflow status functionality
-- This script helps verify that workflow status is working correctly

-- Check current workflow statuses
SELECT 
  id,
  name,
  status,
  CASE 
    WHEN status = 'draft' THEN 'Incomplete workflow'
    WHEN status = 'active' THEN 'Complete and ready to run'
    WHEN status = 'paused' THEN 'Manually paused'
    ELSE 'Unknown status'
  END as status_description,
  jsonb_array_length(nodes) as node_count,
  jsonb_array_length(connections) as connection_count,
  created_at,
  updated_at
FROM workflows 
ORDER BY updated_at DESC
LIMIT 10;

-- Check workflows that should be active but aren't
SELECT 
  id,
  name,
  status,
  jsonb_array_length(nodes) as node_count,
  jsonb_array_length(connections) as connection_count
FROM workflows 
WHERE status != 'active' 
  AND jsonb_array_length(nodes) > 1 
  AND jsonb_array_length(connections) > 0;

-- Check workflows that should be draft but are active
SELECT 
  id,
  name,
  status,
  jsonb_array_length(nodes) as node_count,
  jsonb_array_length(connections) as connection_count
FROM workflows 
WHERE status = 'active' 
  AND (jsonb_array_length(nodes) <= 1 OR jsonb_array_length(connections) = 0);

-- Count workflows by status
SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM workflows), 2) as percentage
FROM workflows 
GROUP BY status 
ORDER BY count DESC; 