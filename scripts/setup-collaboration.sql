-- Run the collaboration tables migration
\i 'db/migrations/create_collaboration_tables.sql'

-- Verify tables were created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'collaboration_sessions',
  'workflow_changes', 
  'workflow_locks',
  'workflow_snapshots',
  'live_execution_events'
);

-- Check if any collaboration sessions exist
SELECT COUNT(*) as session_count FROM collaboration_sessions;

SELECT 'Collaboration tables setup complete!' as status;