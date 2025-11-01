-- Check current workflows table schema
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'workflows'
ORDER BY ordinal_position;
