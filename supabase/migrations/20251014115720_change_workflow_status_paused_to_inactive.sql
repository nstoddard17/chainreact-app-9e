-- Migration: Change workflow status from 'paused' to 'inactive'
-- This clarifies that inactive workflows have no active external resources

-- Step 1: Update all existing 'paused' workflows to 'inactive'
UPDATE workflows
SET status = 'inactive'
WHERE status = 'paused';

-- Step 2: Update status constraint to replace 'paused' with 'inactive'
-- Note: Assuming there's a CHECK constraint on the status column
-- If the constraint doesn't exist, this migration will add it

-- First, drop the existing constraint if it exists
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_status_check;

-- Add new constraint with 'inactive' instead of 'paused'
ALTER TABLE workflows
ADD CONSTRAINT workflows_status_check
CHECK (status IN ('draft', 'active', 'inactive'));

-- Step 3: Add comment to clarify status meanings
COMMENT ON COLUMN workflows.status IS
'Workflow status:
- draft: Never been activated
- active: Currently running with active triggers/webhooks
- inactive: Was previously active, now stopped with all resources cleaned up';
