-- Migration: Suspension notifications system
-- Tracks notifications sent to users about pending team suspensions

-- ============================================================================
-- TABLE: Team suspension notifications
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.team_suspension_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'grace_period_started',
    'grace_period_reminder_3_days',
    'grace_period_reminder_1_day',
    'team_suspended',
    'team_reactivated'
  )),
  sent_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  read_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_suspension_notifications_team_id
  ON public.team_suspension_notifications(team_id);

CREATE INDEX IF NOT EXISTS idx_team_suspension_notifications_user_id
  ON public.team_suspension_notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_team_suspension_notifications_sent_at
  ON public.team_suspension_notifications(sent_at);

CREATE INDEX IF NOT EXISTS idx_team_suspension_notifications_unread
  ON public.team_suspension_notifications(user_id, read_at)
  WHERE read_at IS NULL;

-- Enable RLS
ALTER TABLE public.team_suspension_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own notifications"
  ON public.team_suspension_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mark their notifications as read"
  ON public.team_suspension_notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE public.team_suspension_notifications IS 'Tracks suspension-related notifications sent to team owners';
COMMENT ON COLUMN public.team_suspension_notifications.notification_type IS 'Type of notification: grace_period_started, reminder, suspended, reactivated';
COMMENT ON COLUMN public.team_suspension_notifications.metadata IS 'Additional context like grace_period_ends_at, suspension_reason, etc.';

-- ============================================================================
-- FUNCTION: Create suspension notification
-- ============================================================================

CREATE OR REPLACE FUNCTION create_suspension_notification(
  p_team_id UUID,
  p_user_id UUID,
  p_notification_type TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO public.team_suspension_notifications (
    team_id,
    user_id,
    notification_type,
    metadata,
    sent_at,
    created_at
  ) VALUES (
    p_team_id,
    p_user_id,
    p_notification_type,
    p_metadata,
    NOW(),
    NOW()
  ) RETURNING id INTO notification_id;

  RETURN notification_id;
END;
$$;

COMMENT ON FUNCTION create_suspension_notification IS 'Helper function to create a suspension notification record';

-- ============================================================================
-- FUNCTION: Notify team owner of grace period
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_team_owner_of_grace_period()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  notification_id UUID;
  metadata_json JSONB;
BEGIN
  -- Only trigger when grace_period_ends_at is newly set
  IF NEW.grace_period_ends_at IS NOT NULL AND OLD.grace_period_ends_at IS NULL THEN

    -- Build metadata
    metadata_json := jsonb_build_object(
      'team_id', NEW.id,
      'team_name', NEW.name,
      'suspension_reason', NEW.suspension_reason,
      'grace_period_ends_at', NEW.grace_period_ends_at,
      'days_remaining', EXTRACT(DAY FROM (NEW.grace_period_ends_at - NOW()))
    );

    -- Create notification record
    notification_id := create_suspension_notification(
      NEW.id,
      NEW.created_by,
      'grace_period_started',
      metadata_json
    );

    -- Update the team's notification timestamp
    NEW.suspension_notified_at := NOW();

    RAISE NOTICE 'Created grace period notification (id: %) for team % (id: %) owner %',
      notification_id, NEW.name, NEW.id, NEW.created_by;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION notify_team_owner_of_grace_period IS 'Creates notification when grace period starts for a team';

-- ============================================================================
-- TRIGGER: Send notification when grace period starts
-- ============================================================================

DROP TRIGGER IF EXISTS notify_grace_period_trigger ON public.teams;

CREATE TRIGGER notify_grace_period_trigger
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  WHEN (OLD.grace_period_ends_at IS DISTINCT FROM NEW.grace_period_ends_at)
  EXECUTE FUNCTION notify_team_owner_of_grace_period();

COMMENT ON TRIGGER notify_grace_period_trigger ON public.teams IS 'Notifies team owner when grace period is set';
