-- Create collaboration tables for real-time workflow editing

-- Collaboration sessions table
CREATE TABLE IF NOT EXISTS collaboration_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  cursor_position JSONB DEFAULT '{"x": 0, "y": 0}',
  selected_nodes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflow changes table for tracking collaborative edits
CREATE TABLE IF NOT EXISTS workflow_changes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('node_add', 'node_update', 'node_delete', 'edge_add', 'edge_delete', 'property_update')),
  change_data JSONB NOT NULL,
  change_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  applied BOOLEAN DEFAULT false,
  conflict_resolution JSONB,
  version_hash VARCHAR(32) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflow locks table for preventing concurrent edits
CREATE TABLE IF NOT EXISTS workflow_locks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lock_type VARCHAR(20) NOT NULL CHECK (lock_type IN ('node', 'edge', 'property', 'full')),
  resource_id VARCHAR(255) NOT NULL,
  acquired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(workflow_id, resource_id, lock_type)
);

-- Workflow snapshots table for collaboration history
CREATE TABLE IF NOT EXISTS workflow_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  snapshot_data JSONB NOT NULL,
  snapshot_type VARCHAR(50) DEFAULT 'collaboration',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Live execution events table for real-time execution monitoring
CREATE TABLE IF NOT EXISTS live_execution_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  execution_id UUID,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL,
  node_id VARCHAR(255),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on all collaboration tables
ALTER TABLE collaboration_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_execution_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for collaboration_sessions
CREATE POLICY "Users can access collaboration sessions for workflows they have access to" ON collaboration_sessions
  FOR ALL USING (
    auth.uid() = user_id OR 
    EXISTS (
      SELECT 1 FROM workflows w 
      WHERE w.id = workflow_id AND (
        w.user_id = auth.uid() OR 
        w.is_public = true OR
        EXISTS (
          SELECT 1 FROM workflow_shares ws 
          WHERE ws.workflow_id = w.id AND ws.shared_with = auth.uid()
        )
      )
    )
  );

-- RLS policies for workflow_changes
CREATE POLICY "Users can access workflow changes for workflows they have access to" ON workflow_changes
  FOR ALL USING (
    auth.uid() = user_id OR 
    EXISTS (
      SELECT 1 FROM workflows w 
      WHERE w.id = workflow_id AND (
        w.user_id = auth.uid() OR 
        w.is_public = true OR
        EXISTS (
          SELECT 1 FROM workflow_shares ws 
          WHERE ws.workflow_id = w.id AND ws.shared_with = auth.uid()
        )
      )
    )
  );

-- RLS policies for workflow_locks
CREATE POLICY "Users can access workflow locks for workflows they have access to" ON workflow_locks
  FOR ALL USING (
    auth.uid() = user_id OR 
    EXISTS (
      SELECT 1 FROM workflows w 
      WHERE w.id = workflow_id AND (
        w.user_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM workflow_shares ws 
          WHERE ws.workflow_id = w.id AND ws.shared_with = auth.uid() AND ws.permission = 'edit'
        )
      )
    )
  );

-- RLS policies for workflow_snapshots
CREATE POLICY "Users can access workflow snapshots for workflows they have access to" ON workflow_snapshots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workflows w 
      WHERE w.id = workflow_id AND (
        w.user_id = auth.uid() OR 
        w.is_public = true OR
        EXISTS (
          SELECT 1 FROM workflow_shares ws 
          WHERE ws.workflow_id = w.id AND ws.shared_with = auth.uid()
        )
      )
    )
  );

-- RLS policies for live_execution_events
CREATE POLICY "Users can access execution events for workflows they have access to" ON live_execution_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workflows w 
      WHERE w.id = workflow_id AND (
        w.user_id = auth.uid() OR 
        w.is_public = true OR
        EXISTS (
          SELECT 1 FROM workflow_shares ws 
          WHERE ws.workflow_id = w.id AND ws.shared_with = auth.uid()
        )
      )
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_workflow_id ON collaboration_sessions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_user_id ON collaboration_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_session_token ON collaboration_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_active ON collaboration_sessions(workflow_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_workflow_changes_workflow_id ON workflow_changes(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_changes_user_id ON workflow_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_changes_timestamp ON workflow_changes(workflow_id, change_timestamp);
CREATE INDEX IF NOT EXISTS idx_workflow_changes_unapplied ON workflow_changes(workflow_id, applied) WHERE applied = false;

CREATE INDEX IF NOT EXISTS idx_workflow_locks_workflow_id ON workflow_locks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_locks_user_id ON workflow_locks(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_locks_resource ON workflow_locks(workflow_id, resource_id, lock_type);
CREATE INDEX IF NOT EXISTS idx_workflow_locks_expires ON workflow_locks(expires_at) WHERE expires_at > NOW();

CREATE INDEX IF NOT EXISTS idx_workflow_snapshots_workflow_id ON workflow_snapshots(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_snapshots_created_at ON workflow_snapshots(workflow_id, created_at);

CREATE INDEX IF NOT EXISTS idx_live_execution_events_workflow_id ON live_execution_events(workflow_id);
CREATE INDEX IF NOT EXISTS idx_live_execution_events_execution_id ON live_execution_events(execution_id);
CREATE INDEX IF NOT EXISTS idx_live_execution_events_created_at ON live_execution_events(workflow_id, created_at);

-- Create a function to clean up expired locks
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS void AS $$
BEGIN
  DELETE FROM workflow_locks WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create a function to clean up inactive collaboration sessions
CREATE OR REPLACE FUNCTION cleanup_inactive_sessions()
RETURNS void AS $$
BEGIN
  UPDATE collaboration_sessions 
  SET is_active = false 
  WHERE is_active = true 
    AND last_activity < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;