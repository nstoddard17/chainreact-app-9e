-- Migration: Add team lifecycle management columns
-- This migration adds the necessary columns for team folder management,
-- suspension tracking, and billing enforcement

-- ============================================================================
-- PART 1: Add missing columns to workflow_folders
-- ============================================================================

-- Add is_trash column (for trash folder identification)
ALTER TABLE public.workflow_folders
ADD COLUMN IF NOT EXISTS is_trash BOOLEAN DEFAULT FALSE NOT NULL;

-- Add team_id column (for team-owned folders)
ALTER TABLE public.workflow_folders
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE;

-- Drop the foreign key constraint on user_id
-- We need to do this because team folders will have user_id = team_id,
-- and team IDs don't exist in the users table
ALTER TABLE public.workflow_folders
DROP CONSTRAINT IF EXISTS workflow_folders_user_id_fkey;

-- Note: user_id remains NOT NULL but no longer has a foreign key
-- For personal folders: user_id = actual user UUID
-- For team folders: user_id = team_id (treat team as a virtual user)

-- ============================================================================
-- Fix existing unique constraints to support both user and team folders
-- ============================================================================

-- Drop old constraint if it exists
DROP INDEX IF EXISTS idx_workflow_folders_user_default;

-- Create new constraint: one default folder per user_id (works for both users and teams)
-- For personal folders: user_id = actual user, team_id = NULL
-- For team folders: user_id = team_id, team_id = team_id
-- Since team_id is unique, each team gets one default folder
CREATE UNIQUE INDEX idx_workflow_folders_user_default
  ON public.workflow_folders(user_id)
  WHERE is_default = TRUE;

-- Additional constraint: ensure team folders have matching user_id and team_id
-- This constraint ensures team folders always have user_id = team_id
ALTER TABLE public.workflow_folders
DROP CONSTRAINT IF EXISTS team_folders_user_id_matches_team_id;

ALTER TABLE public.workflow_folders
ADD CONSTRAINT team_folders_user_id_matches_team_id
  CHECK (
    (team_id IS NULL) OR (user_id::text = team_id::text)
  );

-- Add constraint: only one trash folder per team
DROP INDEX IF EXISTS unique_trash_folder_per_team;

CREATE UNIQUE INDEX unique_trash_folder_per_team
  ON public.workflow_folders(user_id)
  WHERE is_trash = TRUE AND team_id IS NOT NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflow_folders_team_id
  ON public.workflow_folders(team_id) WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_folders_is_trash
  ON public.workflow_folders(is_trash) WHERE is_trash = TRUE;

COMMENT ON COLUMN public.workflow_folders.is_trash IS 'True if this folder is the trash folder for a user or team';
COMMENT ON COLUMN public.workflow_folders.team_id IS 'If set, this folder belongs to a team (and user_id = team_id)';

-- ============================================================================
-- PART 2: Add team suspension tracking columns
-- ============================================================================

-- Add suspension tracking to teams table
ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspension_notified_at TIMESTAMPTZ;

-- Add constraint for valid suspension reasons
ALTER TABLE public.teams
DROP CONSTRAINT IF EXISTS valid_suspension_reasons;

ALTER TABLE public.teams
ADD CONSTRAINT valid_suspension_reasons
  CHECK (suspension_reason IS NULL OR suspension_reason IN (
    'owner_downgraded',
    'payment_failed',
    'quota_exceeded',
    'manual_suspension',
    'team_deleted'
  ));

-- Index for finding teams in grace period
CREATE INDEX IF NOT EXISTS idx_teams_grace_period
  ON public.teams(grace_period_ends_at)
  WHERE suspended_at IS NULL AND grace_period_ends_at IS NOT NULL;

-- Index for finding suspended teams
CREATE INDEX IF NOT EXISTS idx_teams_suspended
  ON public.teams(suspended_at, suspension_reason)
  WHERE suspended_at IS NOT NULL;

COMMENT ON COLUMN public.teams.suspended_at IS 'When the team was suspended (workflows stop executing)';
COMMENT ON COLUMN public.teams.suspension_reason IS 'Why the team was suspended';
COMMENT ON COLUMN public.teams.grace_period_ends_at IS 'When the grace period ends and suspension takes effect';
COMMENT ON COLUMN public.teams.suspension_notified_at IS 'When the owner was notified about pending suspension';

-- ============================================================================
-- PART 3: Add team_id to workflows table (for tracking team ownership)
-- ============================================================================

-- Add team_id column to workflows (for identifying team-owned workflows)
ALTER TABLE public.workflows
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workflows_team_id
  ON public.workflows(team_id) WHERE team_id IS NOT NULL;

COMMENT ON COLUMN public.workflows.team_id IS 'If set, this workflow belongs to a team (tracked for migration on team deletion)';

-- ============================================================================
-- PART 4: Update RLS policies for team folders
-- ============================================================================

-- Drop existing policies for workflow_folders (all possible variations)
DROP POLICY IF EXISTS "Users can view own folders" ON public.workflow_folders;
DROP POLICY IF EXISTS "Users can insert own folders" ON public.workflow_folders;
DROP POLICY IF EXISTS "Users can update own folders" ON public.workflow_folders;
DROP POLICY IF EXISTS "Users can delete own folders" ON public.workflow_folders;
DROP POLICY IF EXISTS "Users can view their folders and team folders" ON public.workflow_folders;
DROP POLICY IF EXISTS "Users can insert their own folders" ON public.workflow_folders;
DROP POLICY IF EXISTS "Team members can insert team folders" ON public.workflow_folders;
DROP POLICY IF EXISTS "Team admins can insert team folders" ON public.workflow_folders;
DROP POLICY IF EXISTS "Users can update their folders and team folders (if admin)" ON public.workflow_folders;
DROP POLICY IF EXISTS "Users can delete their folders and team folders (if admin)" ON public.workflow_folders;

-- New RLS policies that handle both user and team folders
-- With user_id = team_id for team folders, policies are simpler
CREATE POLICY "Users can view their folders and team folders"
  ON public.workflow_folders FOR SELECT
  USING (
    -- User's personal folders (user_id = auth.uid(), team_id = NULL)
    (user_id = auth.uid() AND team_id IS NULL)
    OR
    -- Team folders where user is a member (user_id = team_id, team_id = team_id)
    (team_id IS NOT NULL AND team_id IN (
      SELECT team_id
      FROM public.team_members
      WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can insert their own folders"
  ON public.workflow_folders FOR INSERT
  WITH CHECK (
    -- Personal folders: user_id = current user, team_id = NULL
    (auth.uid() = user_id AND team_id IS NULL)
  );

CREATE POLICY "Team admins can insert team folders"
  ON public.workflow_folders FOR INSERT
  WITH CHECK (
    -- Team folders: user_id = team_id, user must be team admin
    (team_id IS NOT NULL
     AND user_id::text = team_id::text
     AND team_id IN (
       SELECT tm.team_id
       FROM public.team_members tm
       WHERE tm.user_id = auth.uid()
       AND tm.role IN ('owner', 'admin')
     )
    )
  );

CREATE POLICY "Users can update their folders and team folders (if admin)"
  ON public.workflow_folders FOR UPDATE
  USING (
    -- Personal folders
    (user_id = auth.uid() AND team_id IS NULL)
    OR
    -- Team folders (if admin)
    (team_id IS NOT NULL AND team_id IN (
      SELECT tm.team_id
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
    ))
  );

CREATE POLICY "Users can delete their folders and team folders (if admin)"
  ON public.workflow_folders FOR DELETE
  USING (
    -- Personal folders
    (user_id = auth.uid() AND team_id IS NULL)
    OR
    -- Team folders (if admin)
    (team_id IS NOT NULL AND team_id IN (
      SELECT tm.team_id
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
    ))
  );
