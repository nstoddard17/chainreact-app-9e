-- Fix missing team_members entries for team creators
-- This migration ensures all team creators are members of their teams

-- Add missing team_members entries for team creators
-- Only insert if the creator is not already a member
INSERT INTO team_members (team_id, user_id, role)
SELECT
  t.id as team_id,
  t.created_by as user_id,
  'owner' as role
FROM teams t
LEFT JOIN team_members tm ON t.id = tm.team_id AND t.created_by = tm.user_id
WHERE
  t.created_by IS NOT NULL  -- Only process teams with a creator
  AND tm.user_id IS NULL     -- Only insert if not already a member
ON CONFLICT (team_id, user_id) DO NOTHING;

-- Add comment explaining the fix
COMMENT ON TABLE team_members IS 'Team membership tracking. All team creators must be added as owner members.';
