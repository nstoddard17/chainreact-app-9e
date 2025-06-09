-- Integrations table for storing OAuth tokens
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_user_id VARCHAR(255),
  access_token TEXT NOT NULL,
  encryption_iv VARCHAR(32) NOT NULL,
  encryption_tag VARCHAR(32) NOT NULL,
  refresh_token TEXT,
  refresh_token_iv VARCHAR(32),
  refresh_token_tag VARCHAR(32),
  expires_at TIMESTAMP WITH TIME ZONE,
  scopes TEXT[],
  metadata JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  last_refreshed_at TIMESTAMP WITH TIME ZONE,
  
  -- Each user can only have one active integration per provider
  UNIQUE(user_id, provider)
);

-- Create index for faster queries
CREATE INDEX idx_integrations_user_provider ON integrations(user_id, provider);
CREATE INDEX idx_integrations_expires_at ON integrations(expires_at) WHERE is_active = TRUE;

-- Token audit logs for tracking token lifecycle events
CREATE TABLE token_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL,
  user_id UUID NOT NULL,
  provider VARCHAR(50) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
);

-- Create index for faster queries
CREATE INDEX idx_token_audit_logs_integration_id ON token_audit_logs(integration_id);
CREATE INDEX idx_token_audit_logs_user_id ON token_audit_logs(user_id);

-- Notifications table for user alerts
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Create index for faster queries
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read) WHERE is_read = FALSE;
