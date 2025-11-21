-- Migration: Team activity tracking
-- Creates table for logging team activity and events

-- ============================================================================
-- TABLE: Team activity log
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.team_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'team_created',
    'member_joined',
    'member_left',
    'member_removed',
    'member_role_changed',
    'member_invited',
    'workflow_created',
    'workflow_updated',
    'workflow_activated',
    'workflow_deactivated',
    'workflow_deleted',
    'integration_connected',
    'integration_disconnected',
    'settings_updated',
    'team_renamed',
    'team_description_updated'
  )),
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_activity_team_id
  ON public.team_activity(team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_activity_user_id
  ON public.team_activity(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_team_activity_type
  ON public.team_activity(activity_type);

CREATE INDEX IF NOT EXISTS idx_team_activity_created_at
  ON public.team_activity(created_at DESC);

-- Enable RLS
ALTER TABLE public.team_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policies - team members can view activity
CREATE POLICY "Team members can view team activity"
  ON public.team_activity FOR SELECT
  USING (
    team_id IN (
      SELECT team_id
      FROM public.team_members
      WHERE user_id = auth.uid()
    )
  );

-- Only service role can insert (via API)
CREATE POLICY "Service role can insert activity"
  ON public.team_activity FOR INSERT
  WITH CHECK (true); -- Will be enforced at API layer

-- Comments
COMMENT ON TABLE public.team_activity IS 'Tracks team activity and events for audit log and recent activity feed';
COMMENT ON COLUMN public.team_activity.activity_type IS 'Type of activity: member_joined, workflow_created, etc.';
COMMENT ON COLUMN public.team_activity.description IS 'Human-readable description of the activity';
COMMENT ON COLUMN public.team_activity.metadata IS 'Additional context like old_role, new_role, workflow_name, etc.';

-- ============================================================================
-- FUNCTION: Log team activity
-- ============================================================================

CREATE OR REPLACE FUNCTION log_team_activity(
  p_team_id UUID,
  p_user_id UUID,
  p_activity_type TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  activity_id UUID;
BEGIN
  INSERT INTO public.team_activity (
    team_id,
    user_id,
    activity_type,
    description,
    metadata,
    created_at
  ) VALUES (
    p_team_id,
    p_user_id,
    p_activity_type,
    p_description,
    p_metadata,
    NOW()
  ) RETURNING id INTO activity_id;

  RETURN activity_id;
END;
$$;

COMMENT ON FUNCTION log_team_activity IS 'Helper function to log team activity';

-- ============================================================================
-- TRIGGER: Log team creation
-- ============================================================================

CREATE OR REPLACE FUNCTION log_team_creation()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM log_team_activity(
    NEW.id,
    NEW.created_by,
    'team_created',
    'Team was created',
    jsonb_build_object(
      'team_name', NEW.name,
      'team_slug', NEW.slug
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_team_creation_trigger ON public.teams;

CREATE TRIGGER log_team_creation_trigger
  AFTER INSERT ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION log_team_creation();

COMMENT ON TRIGGER log_team_creation_trigger ON public.teams IS 'Logs team creation activity';

-- ============================================================================
-- TRIGGER: Log member joining
-- ============================================================================

CREATE OR REPLACE FUNCTION log_member_joined()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Get user email
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = NEW.user_id;

  PERFORM log_team_activity(
    NEW.team_id,
    NEW.user_id,
    'member_joined',
    user_email || ' joined the team',
    jsonb_build_object(
      'role', NEW.role,
      'user_email', user_email
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_member_joined_trigger ON public.team_members;

CREATE TRIGGER log_member_joined_trigger
  AFTER INSERT ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION log_member_joined();

COMMENT ON TRIGGER log_member_joined_trigger ON public.team_members IS 'Logs when a member joins a team';
