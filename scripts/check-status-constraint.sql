-- Check the status constraint on integrations table
-- This will show us what values are allowed

-- 1. Check the current constraint
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'integrations'::regclass 
  AND conname = 'integrations_status_check';

-- 2. Check what status values currently exist
SELECT 
  status,
  COUNT(*) as count
FROM integrations 
GROUP BY status
ORDER BY count DESC;

-- 3. Check if 'expired' is a valid status by looking at the constraint definition
-- If the constraint doesn't allow 'expired', we need to fix it

-- 4. Show all current status values in the database
SELECT DISTINCT status FROM integrations ORDER BY status;

-- 5. If 'expired' is not allowed, we need to update the constraint
-- This will drop and recreate the constraint to allow 'expired'
DO $$
BEGIN
  -- Drop the existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'integrations'::regclass 
      AND conname = 'integrations_status_check'
  ) THEN
    ALTER TABLE integrations DROP CONSTRAINT integrations_status_check;
  END IF;
  
  -- Add the new constraint that allows 'expired'
  ALTER TABLE integrations 
  ADD CONSTRAINT integrations_status_check 
  CHECK (status IN ('connected', 'disconnected', 'expired', 'needs_reauthorization', 'error', 'syncing'));
  
  RAISE NOTICE 'Updated integrations_status_check constraint to allow expired status';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error updating constraint: %', SQLERRM;
END $$;

-- 6. Verify the new constraint
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'integrations'::regclass 
  AND conname = 'integrations_status_check'; 