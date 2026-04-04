-- Migration: Add notification milestone tracking columns
-- Purpose: Enable deterministic health state machine for notifications.
-- Part of P0A: canonical state + dedup.
--
-- Core model: healthy → warning → action_required → disconnected → paused
-- Each transition notifies exactly once. Unchanged state never re-alerts.

-- =============================================================================
-- NOTIFICATION MILESTONE TRACKING
-- =============================================================================

-- Last notification milestone emitted for this integration.
-- Drives dedup: the transition engine only notifies when this value would change.
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_notification_milestone TEXT DEFAULT 'none';

-- When the last notification was sent for this integration.
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

-- =============================================================================
-- FIX: health_check_status default
-- =============================================================================
-- The original migration (20260207) defaulted health_check_status to 'unknown'.
-- Per plan: NULL means unobserved. An integration that has never been checked
-- is not "unknown" — it is unobserved. NULL must never render as healthy.
-- First proactive check establishes baseline silently.
-- First live runtime failure notifies immediately.

ALTER TABLE integrations ALTER COLUMN health_check_status DROP DEFAULT;

-- Set existing 'unknown' values back to NULL so they are treated as unobserved.
UPDATE integrations SET health_check_status = NULL WHERE health_check_status = 'unknown';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Find integrations by notification milestone (for escalation cron)
CREATE INDEX IF NOT EXISTS idx_integrations_notification_milestone
  ON integrations(last_notification_milestone)
  WHERE requires_user_action = TRUE;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON COLUMN integrations.last_notification_milestone IS 'Last notification milestone: none, warning, action_required_initial, reminder_day_2, urgent_day_5, paused_day_7, recovered';
COMMENT ON COLUMN integrations.last_notified_at IS 'Timestamp of last notification sent for this integration';
