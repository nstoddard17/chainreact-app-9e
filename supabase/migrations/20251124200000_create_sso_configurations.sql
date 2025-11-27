-- Create SSO configurations table for enterprise customers
CREATE TABLE IF NOT EXISTS sso_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('saml', 'oidc', 'oauth2')),
  provider_name TEXT NOT NULL,
  -- Encrypted configuration stored as JSONB
  configuration JSONB NOT NULL DEFAULT '{}',
  -- SAML specific
  entity_id TEXT,
  sso_url TEXT,
  slo_url TEXT, -- Single logout URL
  x509_certificate TEXT,
  -- OIDC specific
  client_id TEXT,
  discovery_url TEXT,
  -- General settings
  metadata_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  enforce_sso BOOLEAN NOT NULL DEFAULT false, -- Force all users to use SSO
  auto_provision_users BOOLEAN NOT NULL DEFAULT true, -- Auto-create users on first SSO login
  default_role TEXT DEFAULT 'member',
  allowed_domains TEXT[], -- Restrict SSO to specific email domains
  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  -- Ensure only one active config per provider per org
  CONSTRAINT unique_active_provider_per_org UNIQUE (organization_id, provider, is_active)
    DEFERRABLE INITIALLY DEFERRED
);

-- Create index for quick lookups
CREATE INDEX idx_sso_configurations_org_id ON sso_configurations(organization_id);
CREATE INDEX idx_sso_configurations_active ON sso_configurations(organization_id, is_active) WHERE is_active = true;

-- SSO login attempts tracking for security
CREATE TABLE IF NOT EXISTS sso_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sso_config_id UUID NOT NULL REFERENCES sso_configurations(id) ON DELETE CASCADE,
  user_email TEXT,
  user_id UUID REFERENCES auth.users(id),
  ip_address INET,
  user_agent TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
  error_message TEXT,
  saml_request_id TEXT, -- For SAML request tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sso_login_attempts_config ON sso_login_attempts(sso_config_id);
CREATE INDEX idx_sso_login_attempts_email ON sso_login_attempts(user_email);
CREATE INDEX idx_sso_login_attempts_created ON sso_login_attempts(created_at);

-- SSO domain mappings - map email domains to organizations
CREATE TABLE IF NOT EXISTS sso_domain_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sso_config_id UUID REFERENCES sso_configurations(id) ON DELETE SET NULL,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verification_token TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_domain UNIQUE (domain)
);

CREATE INDEX idx_sso_domain_mappings_domain ON sso_domain_mappings(domain);
CREATE INDEX idx_sso_domain_mappings_org ON sso_domain_mappings(organization_id);

-- Enable RLS
ALTER TABLE sso_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sso_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sso_domain_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sso_configurations
CREATE POLICY "Organization admins can view SSO configs"
  ON sso_configurations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = sso_configurations.organization_id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Organization owners can manage SSO configs"
  ON sso_configurations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = sso_configurations.organization_id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role = 'owner'
    )
  );

-- RLS Policies for sso_login_attempts (read-only for admins)
CREATE POLICY "Organization admins can view SSO login attempts"
  ON sso_login_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sso_configurations sc
      JOIN organization_members om ON om.organization_id = sc.organization_id
      WHERE sc.id = sso_login_attempts.sso_config_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- RLS Policies for sso_domain_mappings
CREATE POLICY "Organization admins can view domain mappings"
  ON sso_domain_mappings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = sso_domain_mappings.organization_id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Organization owners can manage domain mappings"
  ON sso_domain_mappings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = sso_domain_mappings.organization_id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role = 'owner'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sso_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sso_configurations_updated_at
  BEFORE UPDATE ON sso_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_sso_configurations_updated_at();

-- Add comment for documentation
COMMENT ON TABLE sso_configurations IS 'SSO/SAML/OIDC configurations for enterprise organizations';
COMMENT ON TABLE sso_login_attempts IS 'Audit log of SSO login attempts for security monitoring';
COMMENT ON TABLE sso_domain_mappings IS 'Maps email domains to organizations for automatic SSO routing';
