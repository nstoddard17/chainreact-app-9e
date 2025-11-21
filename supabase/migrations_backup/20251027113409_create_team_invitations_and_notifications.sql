-- ================================================================
-- TEAM INVITATIONS & NOTIFICATIONS
-- Created: 2025-10-27
-- This migration creates tables for in-app team invitations and notifications
-- ================================================================

-- ================================================================
-- TEAM INVITATIONS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending',
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, invitee_id),
  CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  CHECK (role IN ('member', 'manager', 'admin'))
);

-- Enable RLS
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for team_invitations
-- Invitees can view their own invitations
CREATE POLICY "Users can view invitations sent to them"
  ON public.team_invitations FOR SELECT
  USING (auth.uid() = invitee_id);

-- Team admins can view invitations they sent
CREATE POLICY "Inviters can view invitations they sent"
  ON public.team_invitations FOR SELECT
  USING (auth.uid() = inviter_id);

-- Team admins can create invitations (with plan check in API)
CREATE POLICY "Team admins can create invitations"
  ON public.team_invitations FOR INSERT
  WITH CHECK (
    auth.uid() = inviter_id AND
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = team_invitations.team_id
      AND team_members.user_id = auth.uid()
      AND team_members.role IN ('owner', 'admin', 'manager')
    )
  );

-- Invitees can update their own invitations (accept/reject)
CREATE POLICY "Invitees can update their invitations"
  ON public.team_invitations FOR UPDATE
  USING (auth.uid() = invitee_id);

-- Inviters can delete pending invitations they sent
CREATE POLICY "Inviters can delete pending invitations"
  ON public.team_invitations FOR DELETE
  USING (
    auth.uid() = inviter_id AND
    status = 'pending'
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_invitations_invitee_id ON public.team_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_team_id ON public.team_invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON public.team_invitations(status);
CREATE INDEX IF NOT EXISTS idx_team_invitations_expires_at ON public.team_invitations(expires_at);

-- ================================================================
-- NOTIFICATIONS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  action_label TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (type IN ('team_invitation', 'workflow_shared', 'execution_failed', 'integration_disconnected', 'system'))
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- System can insert notifications (handled via service role)
CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- ================================================================
-- FUNCTION: Auto-expire invitations
-- ================================================================
CREATE OR REPLACE FUNCTION expire_old_team_invitations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.team_invitations
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$;

-- ================================================================
-- FUNCTION: Clean up expired notifications (older than 30 days)
-- ================================================================
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE is_read = true
    AND created_at < NOW() - INTERVAL '30 days';
END;
$$;
