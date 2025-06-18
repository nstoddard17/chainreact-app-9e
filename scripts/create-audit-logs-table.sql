-- Create the missing audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID, -- Made optional since organizations table doesn't exist
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  event_type VARCHAR(50), -- Added for workflow events
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for audit_logs - simplified since organizations table doesn't exist
CREATE POLICY "Users can see their own audit logs" ON audit_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own audit logs" ON audit_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);

-- Create function to clean up old audit logs
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM audit_logs 
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql; 