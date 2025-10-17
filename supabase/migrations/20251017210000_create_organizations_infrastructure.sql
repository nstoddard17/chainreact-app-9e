-- =====================================================
-- Organizations Infrastructure Migration
-- =====================================================
-- This migration adds organization-level structure to support:
-- - Multi-tenant cloud deployments
-- - Self-hosted enterprise deployments
-- - Proper billing and access control boundaries
-- =====================================================

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  billing_email TEXT,
  billing_address JSONB DEFAULT '{}'::jsonb,
  deployment_type TEXT NOT NULL DEFAULT 'cloud' CHECK (deployment_type IN ('cloud', 'self-hosted')),
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'pro', 'enterprise')),
  settings JSONB DEFAULT '{}'::jsonb,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create organization_members junction table
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Create organization_invitations table for email invites
CREATE TABLE IF NOT EXISTS organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, email)
);

-- Add organization_id to teams table (nullable for migration)
ALTER TABLE teams
  ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Add organization_id to workflows table (nullable for migration)
ALTER TABLE workflows
  ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_organization_id ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_invitations_organization_id ON organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_invitations_email ON organization_invitations(email);
CREATE INDEX IF NOT EXISTS idx_organization_invitations_token ON organization_invitations(token);
CREATE INDEX IF NOT EXISTS idx_teams_organization_id ON teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflows_organization_id ON workflows(organization_id);

-- Enable RLS on organizations tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Functions and Triggers
-- =====================================================

-- Function to automatically add creator as organization owner
CREATE OR REPLACE FUNCTION add_organization_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to add creator as owner when organization is created
DROP TRIGGER IF EXISTS on_organization_created ON organizations;
CREATE TRIGGER on_organization_created
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION add_organization_creator_as_owner();

-- Function to update organizations updated_at timestamp
CREATE OR REPLACE FUNCTION update_organizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_organizations_timestamp ON organizations;
CREATE TRIGGER update_organizations_timestamp
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_organizations_updated_at();

-- Function to generate unique slug from organization name
CREATE OR REPLACE FUNCTION generate_organization_slug(org_name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INT := 0;
BEGIN
  -- Convert to lowercase, replace spaces/special chars with hyphens
  base_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);

  -- Try the base slug first
  final_slug := base_slug;

  -- If it exists, append numbers until we find a unique one
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- RLS Policies for Organizations
-- =====================================================

-- Users can view organizations they belong to
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Authenticated users can create organizations
CREATE POLICY "Users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());

-- Organization owners and admins can update organizations
CREATE POLICY "Org owners and admins can update organizations"
  ON organizations FOR UPDATE
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Organization owners can delete organizations
CREATE POLICY "Org owners can delete organizations"
  ON organizations FOR DELETE
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role = 'owner'
    )
  );

-- =====================================================
-- RLS Policies for Organization Members
-- =====================================================

-- Users can view members of organizations they belong to
CREATE POLICY "Users can view org members"
  ON organization_members FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Org owners and admins can add members
CREATE POLICY "Org owners and admins can add members"
  ON organization_members FOR INSERT
  WITH CHECK (
    -- Allow if user is already owner/admin of the org
    organization_id IN (
      SELECT organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
    OR
    -- Allow if adding yourself as owner to an org you created (for trigger)
    (user_id = auth.uid() AND role = 'owner' AND organization_id IN (
      SELECT id FROM organizations WHERE owner_id = auth.uid()
    ))
  );

-- Org owners and admins can update member roles
CREATE POLICY "Org owners and admins can update members"
  ON organization_members FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Org owners and admins can remove members
CREATE POLICY "Org owners and admins can remove members"
  ON organization_members FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- RLS Policies for Organization Invitations
-- =====================================================

-- Org members can view invitations for their organization
CREATE POLICY "Org members can view invitations"
  ON organization_invitations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Org owners and admins can create invitations
CREATE POLICY "Org owners and admins can create invitations"
  ON organization_invitations FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Org owners and admins can delete invitations
CREATE POLICY "Org owners and admins can delete invitations"
  ON organization_invitations FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- =====================================================
-- Update Existing RLS Policies for Teams
-- =====================================================

-- Drop existing team policies (will be recreated with org awareness)
DROP POLICY IF EXISTS "Users can view teams they belong to" ON teams;
DROP POLICY IF EXISTS "Users can create teams" ON teams;
DROP POLICY IF EXISTS "Team owners and admins can update teams" ON teams;
DROP POLICY IF EXISTS "Team owners can delete teams" ON teams;

-- Users can view teams in their organizations
CREATE POLICY "Users can view teams in their organizations"
  ON teams FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can create teams in organizations they belong to
CREATE POLICY "Users can create teams in their organizations"
  ON teams FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Team owners and admins can update teams
CREATE POLICY "Team owners and admins can update teams"
  ON teams FOR UPDATE
  USING (
    id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Team owners can delete teams
CREATE POLICY "Team owners can delete teams"
  ON teams FOR DELETE
  USING (
    id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid()
      AND role = 'owner'
    )
  );

-- =====================================================
-- Comments and Documentation
-- =====================================================

COMMENT ON TABLE organizations IS 'Top-level organizational structure. Maps to deployment units for self-hosted or tenants for cloud.';
COMMENT ON TABLE organization_members IS 'Junction table tracking organization membership and roles.';
COMMENT ON TABLE organization_invitations IS 'Pending email invitations to join organizations.';
COMMENT ON COLUMN organizations.deployment_type IS 'Whether this org is cloud-hosted or self-hosted.';
COMMENT ON COLUMN organizations.plan_type IS 'Billing plan: free, pro, or enterprise.';
COMMENT ON COLUMN organizations.slug IS 'URL-friendly unique identifier for the organization.';
COMMENT ON COLUMN organizations.owner_id IS 'Primary owner of the organization with full admin rights.';
COMMENT ON COLUMN teams.organization_id IS 'The organization this team belongs to. Nullable during migration.';
COMMENT ON COLUMN workflows.organization_id IS 'The organization this workflow belongs to. Nullable during migration.';
