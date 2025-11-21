-- ================================================================
-- ADD NEW NOTIFICATION TYPES
-- Created: 2025-11-11
-- Purpose: Add integration warning and rate limit notification types
-- ================================================================

-- Drop the existing constraint
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add the new constraint with additional types
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (type IN (
  'team_invitation',
  'workflow_shared',
  'execution_failed',
  'integration_disconnected',
  'integration_warning',      -- NEW: Warning before disconnection
  'integration_rate_limit',   -- NEW: Rate limit notifications
  'system'
));

-- Add comment explaining the new types
COMMENT ON COLUMN public.notifications.type IS
'Notification type: team_invitation, workflow_shared, execution_failed, integration_disconnected, integration_warning (2nd failure), integration_rate_limit (transient), system';
