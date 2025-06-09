-- Add status column to integrations table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'integrations' AND column_name = 'status') THEN
        ALTER TABLE integrations ADD COLUMN status VARCHAR(20) DEFAULT 'connected';
    END IF;
END$$;

-- Add last_refreshed column to integrations table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'integrations' AND column_name = 'last_refreshed') THEN
        ALTER TABLE integrations ADD COLUMN last_refreshed TIMESTAMP WITH TIME ZONE;
    END IF;
END$$;

-- Create token_audit_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS token_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL,
    user_id UUID NOT NULL,
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
);

-- Create index on token_audit_logs for faster queries
CREATE INDEX IF NOT EXISTS idx_token_audit_logs_user_id ON token_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_token_audit_logs_provider ON token_audit_logs(provider);
CREATE INDEX IF NOT EXISTS idx_token_audit_logs_event_type ON token_audit_logs(event_type);

-- Create notifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    action_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Create index on notifications for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- Create function to clean up old audit logs
CREATE OR REPLACE FUNCTION cleanup_old_token_audit_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM token_audit_logs
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Create function to log token events
CREATE OR REPLACE FUNCTION log_token_event(
    p_integration_id UUID,
    p_user_id UUID,
    p_provider VARCHAR,
    p_event_type VARCHAR,
    p_event_details JSONB
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO token_audit_logs (integration_id, user_id, provider, event_type, event_details)
    VALUES (p_integration_id, p_user_id, p_provider, p_event_type, p_event_details)
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to create a notification for token expiry
CREATE OR REPLACE FUNCTION create_token_expiry_notification(
    p_user_id UUID,
    p_provider VARCHAR
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO notifications (user_id, type, title, message, action_url, expires_at)
    VALUES (
        p_user_id,
        'token_expired',
        p_provider || ' Integration Disconnected',
        'Your ' || p_provider || ' integration has been disconnected due to an expired token. Please reconnect to continue using this integration.',
        '/integrations?provider=' || p_provider,
        NOW() + INTERVAL '7 days'
    )
    RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;
