-- =====================================================
-- Authorization Management Setup Script
-- This script sets up all necessary tables, indexes, 
-- functions, and policies for OAuth token management
-- =====================================================

-- First, ensure the integrations table has all required columns
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_user_id VARCHAR(255),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  scopes TEXT[],
  metadata JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'connected',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  last_refreshed_at TIMESTAMP WITH TIME ZONE
);

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Add status column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'integrations' AND column_name = 'status') THEN
    ALTER TABLE integrations ADD COLUMN status VARCHAR(20) DEFAULT 'connected';
  END IF;

  -- Add last_refreshed_at column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'integrations' AND column_name = 'last_refreshed_at') THEN
    ALTER TABLE integrations ADD COLUMN last_refreshed_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Add last_used_at column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'integrations' AND column_name = 'last_used_at') THEN
    ALTER TABLE integrations ADD COLUMN last_used_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Add scopes column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'integrations' AND column_name = 'scopes') THEN
    ALTER TABLE integrations ADD COLUMN scopes TEXT[];
  END IF;

  -- Add metadata column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'integrations' AND column_name = 'metadata') THEN
    ALTER TABLE integrations ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;

  -- Add is_active column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'integrations' AND column_name = 'is_active') THEN
    ALTER TABLE integrations ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
  END IF;

  -- Add provider_user_id column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'integrations' AND column_name = 'provider_user_id') THEN
    ALTER TABLE integrations ADD COLUMN provider_user_id VARCHAR(255);
  END IF;
END$$;

-- Ensure TEXT type for tokens (some might be VARCHAR with length limits)
ALTER TABLE integrations ALTER COLUMN access_token TYPE TEXT;
ALTER TABLE integrations ALTER COLUMN refresh_token TYPE TEXT;

-- Add unique constraint for user_id + provider combination
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'integrations_user_id_provider_key'
  ) THEN
    -- First remove any duplicates
    WITH duplicates AS (
      SELECT user_id, provider, MAX(updated_at) as latest_updated_at,
             array_agg(id ORDER BY updated_at DESC) as ids
      FROM integrations
      GROUP BY user_id, provider
      HAVING COUNT(*) > 1
    )
    DELETE FROM integrations
    WHERE id IN (
      SELECT unnest(ids[2:array_length(ids, 1)])
      FROM duplicates
    );
    
    -- Now add the constraint
    ALTER TABLE integrations 
    ADD CONSTRAINT integrations_user_id_provider_key 
    UNIQUE (user_id, provider);
  END IF;
END$$;

-- Create token audit logs table
CREATE TABLE IF NOT EXISTS token_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID,
  user_id UUID NOT NULL,
  provider VARCHAR(50) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE SET NULL
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Create integration health checks table
CREATE TABLE IF NOT EXISTS integration_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL,
  check_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  response_time_ms INTEGER,
  error_message TEXT,
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);
CREATE INDEX IF NOT EXISTS idx_integrations_expires_at ON integrations(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_integrations_active_tokens ON integrations(user_id, provider) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_token_audit_logs_user_id ON token_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_token_audit_logs_provider ON token_audit_logs(provider);
CREATE INDEX IF NOT EXISTS idx_token_audit_logs_event_type ON token_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_token_audit_logs_created_at ON token_audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

CREATE INDEX IF NOT EXISTS idx_health_checks_integration ON integration_health_checks(integration_id);
CREATE INDEX IF NOT EXISTS idx_health_checks_status ON integration_health_checks(status);

-- Create functions for token management
CREATE OR REPLACE FUNCTION log_token_event(
  p_integration_id UUID,
  p_user_id UUID,
  p_provider VARCHAR,
  p_event_type VARCHAR,
  p_event_details JSONB DEFAULT '{}',
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO token_audit_logs (
    integration_id, user_id, provider, event_type, 
    event_details, ip_address, user_agent
  )
  VALUES (
    p_integration_id, p_user_id, p_provider, p_event_type,
    p_event_details, p_ip_address, p_user_agent
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type VARCHAR,
  p_title VARCHAR,
  p_message TEXT,
  p_action_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO notifications (
    user_id, type, title, message, action_url, metadata, expires_at
  )
  VALUES (
    p_user_id, p_type, p_title, p_message, p_action_url, p_metadata, p_expires_at
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_integration_status(
  p_integration_id UUID,
  p_status VARCHAR,
  p_metadata JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE integrations 
  SET 
    status = p_status,
    metadata = COALESCE(p_metadata, metadata),
    updated_at = NOW()
  WHERE id = p_integration_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_integration_used(
  p_integration_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE integrations 
  SET last_used_at = NOW()
  WHERE id = p_integration_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Mark expired tokens as disconnected
  UPDATE integrations 
  SET 
    status = 'expired',
    updated_at = NOW()
  WHERE 
    expires_at < NOW() 
    AND status = 'connected'
    AND expires_at IS NOT NULL;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  -- Log the cleanup
  INSERT INTO token_audit_logs (user_id, provider, event_type, event_details)
  SELECT 
    user_id, 
    provider, 
    'token_expired_cleanup',
    jsonb_build_object('expired_count', v_count)
  FROM integrations 
  WHERE status = 'expired' 
  LIMIT 1;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM token_audit_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_integrations_updated_at ON integrations;
CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) if using Supabase
DO $$
BEGIN
  -- Check if we're in a Supabase environment (has auth schema)
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    -- Enable RLS on integrations
    ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
    
    -- Create RLS policies
    DROP POLICY IF EXISTS "Users can only see their own integrations" ON integrations;
    CREATE POLICY "Users can only see their own integrations" ON integrations
      FOR ALL USING (auth.uid() = user_id);
    
    -- Enable RLS on token_audit_logs
    ALTER TABLE token_audit_logs ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Users can only see their own audit logs" ON token_audit_logs;
    CREATE POLICY "Users can only see their own audit logs" ON token_audit_logs
      FOR ALL USING (auth.uid() = user_id);
    
    -- Enable RLS on notifications
    ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Users can only see their own notifications" ON notifications;
    CREATE POLICY "Users can only see their own notifications" ON notifications
      FOR ALL USING (auth.uid() = user_id);
    
    -- Enable RLS on integration_health_checks
    ALTER TABLE integration_health_checks ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Users can only see health checks for their integrations" ON integration_health_checks;
    CREATE POLICY "Users can only see health checks for their integrations" ON integration_health_checks
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM integrations 
          WHERE integrations.id = integration_health_checks.integration_id 
          AND integrations.user_id = auth.uid()
        )
      );
  END IF;
END$$;

-- Insert some initial data for testing (optional)
-- This creates a sample notification type configuration
INSERT INTO notifications (user_id, type, title, message, metadata)
SELECT 
  '00000000-0000-0000-0000-000000000000'::uuid,
  'system',
  'Authorization Management Setup Complete',
  'Your OAuth token management system has been successfully configured.',
  '{"setup_version": "1.0", "features": ["token_refresh", "audit_logging", "health_checks"]}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM notifications 
  WHERE type = 'system' AND title = 'Authorization Management Setup Complete'
);

-- Create a view for integration health summary
CREATE OR REPLACE VIEW integration_health_summary AS
SELECT 
  i.id,
  i.user_id,
  i.provider,
  i.status,
  i.expires_at,
  i.last_used_at,
  i.last_refreshed_at,
  CASE 
    WHEN i.expires_at IS NOT NULL AND i.expires_at < NOW() THEN 'expired'
    WHEN i.expires_at IS NOT NULL AND i.expires_at < NOW() + INTERVAL '7 days' THEN 'expiring_soon'
    WHEN i.last_used_at < NOW() - INTERVAL '30 days' THEN 'inactive'
    WHEN i.status = 'connected' THEN 'healthy'
    ELSE i.status
  END as health_status,
  (
    SELECT COUNT(*) 
    FROM token_audit_logs tal 
    WHERE tal.integration_id = i.id 
    AND tal.event_type = 'token_refresh_failed'
    AND tal.created_at > NOW() - INTERVAL '24 hours'
  ) as recent_failures
FROM integrations i
WHERE i.is_active = TRUE;

-- Final verification query
SELECT 
  'Setup Complete' as status,
  (SELECT COUNT(*) FROM integrations) as total_integrations,
  (SELECT COUNT(*) FROM token_audit_logs) as total_audit_logs,
  (SELECT COUNT(*) FROM notifications) as total_notifications,
  NOW() as completed_at;
