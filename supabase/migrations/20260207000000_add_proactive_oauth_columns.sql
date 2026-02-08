-- Migration: Add proactive OAuth management columns
-- Purpose: Enable "never need to reconnect" experience matching Zapier/Make.com/n8n

-- =============================================================================
-- HEALTH CHECK TRACKING
-- =============================================================================

-- When was the last proactive health check performed
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ;

-- When should the next health check be performed
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS next_health_check_at TIMESTAMPTZ;

-- Current health status from last check
-- Values: 'unknown', 'healthy', 'degraded', 'expired', 'revoked'
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS health_check_status TEXT DEFAULT 'unknown';

-- =============================================================================
-- USER ACTION TRACKING
-- =============================================================================

-- Whether user intervention is required
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS requires_user_action BOOLEAN DEFAULT FALSE;

-- Type of action required
-- Values: 'reconnect', 'reauthorize_scopes', null
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS user_action_type TEXT;

-- Deadline for user action before workflows are paused
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS user_action_deadline TIMESTAMPTZ;

-- When the user was last notified about required action
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS user_action_notified_at TIMESTAMPTZ;

-- =============================================================================
-- ENHANCED ERROR TRACKING
-- =============================================================================

-- Standardized error code from last failure
-- Values: 'invalid_grant', 'revoked', 'scope_changed', 'rate_limited', 'network_error', 'server_error', 'unknown'
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_error_code TEXT;

-- Detailed error information (provider response, timestamps, context)
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_error_details JSONB;

-- =============================================================================
-- RACE CONDITION PROTECTION (Distributed Locking)
-- =============================================================================

-- Timestamp when refresh lock was acquired
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS refresh_lock_at TIMESTAMPTZ;

-- Unique ID of the process holding the lock
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS refresh_lock_id TEXT;

-- =============================================================================
-- INDEXES FOR EFFICIENT QUERYING
-- =============================================================================

-- Find integrations due for health check
CREATE INDEX IF NOT EXISTS idx_integrations_next_health_check
  ON integrations(next_health_check_at)
  WHERE status = 'connected' AND next_health_check_at IS NOT NULL;

-- Find integrations requiring user action
CREATE INDEX IF NOT EXISTS idx_integrations_requires_action
  ON integrations(user_action_deadline)
  WHERE requires_user_action = TRUE;

-- Find stale locks (for cleanup)
CREATE INDEX IF NOT EXISTS idx_integrations_refresh_lock
  ON integrations(refresh_lock_at)
  WHERE refresh_lock_at IS NOT NULL;

-- Find integrations by health status
CREATE INDEX IF NOT EXISTS idx_integrations_health_status
  ON integrations(health_check_status)
  WHERE status = 'connected';

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON COLUMN integrations.last_health_check_at IS 'Timestamp of last proactive health validation';
COMMENT ON COLUMN integrations.next_health_check_at IS 'When next health check should occur (provider-specific intervals)';
COMMENT ON COLUMN integrations.health_check_status IS 'Result of last health check: unknown, healthy, degraded, expired, revoked';
COMMENT ON COLUMN integrations.requires_user_action IS 'Whether user must take action to restore integration';
COMMENT ON COLUMN integrations.user_action_type IS 'Type of action required: reconnect, reauthorize_scopes';
COMMENT ON COLUMN integrations.user_action_deadline IS 'Deadline before workflows using this integration are paused';
COMMENT ON COLUMN integrations.user_action_notified_at IS 'When user was last notified about required action';
COMMENT ON COLUMN integrations.last_error_code IS 'Standardized error code from last failure';
COMMENT ON COLUMN integrations.last_error_details IS 'Detailed error context as JSONB';
COMMENT ON COLUMN integrations.refresh_lock_at IS 'Distributed lock timestamp for concurrent refresh prevention';
COMMENT ON COLUMN integrations.refresh_lock_id IS 'Unique process ID holding the refresh lock';
