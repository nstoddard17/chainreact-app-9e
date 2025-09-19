-- Create discord_invite_roles table for tracking invite-to-role mappings
CREATE TABLE IF NOT EXISTS discord_invite_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  invite_code VARCHAR(255) NOT NULL,
  role_id VARCHAR(255) NOT NULL,
  server_id VARCHAR(255) NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(server_id, invite_code)
);

-- Add RLS policies
ALTER TABLE discord_invite_roles ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their organization's invite-role mappings
CREATE POLICY "Users can view their organization's Discord invite roles"
  ON discord_invite_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = discord_invite_roles.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

-- Policy for users to create invite-role mappings
CREATE POLICY "Users can create Discord invite roles for their organization"
  ON discord_invite_roles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = discord_invite_roles.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

-- Policy for users to update their organization's invite-role mappings
CREATE POLICY "Users can update their organization's Discord invite roles"
  ON discord_invite_roles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = discord_invite_roles.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

-- Policy for users to delete their organization's invite-role mappings
CREATE POLICY "Users can delete their organization's Discord invite roles"
  ON discord_invite_roles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = discord_invite_roles.organization_id
      AND organization_members.user_id = auth.uid()
    )
  );

-- Create index for faster lookups
CREATE INDEX idx_discord_invite_roles_server_invite ON discord_invite_roles(server_id, invite_code);
CREATE INDEX idx_discord_invite_roles_organization ON discord_invite_roles(organization_id);