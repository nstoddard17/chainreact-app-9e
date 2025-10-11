-- Fix references in workflow_test_sessions and execution_progress tables

-- First drop the existing foreign key constraints
ALTER TABLE workflow_test_sessions DROP CONSTRAINT IF EXISTS workflow_test_sessions_user_id_fkey;
ALTER TABLE execution_progress DROP CONSTRAINT IF EXISTS execution_progress_user_id_fkey;

-- Re-add the foreign key constraints with correct reference to auth.users
ALTER TABLE workflow_test_sessions
  ADD CONSTRAINT workflow_test_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE execution_progress
  ADD CONSTRAINT execution_progress_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;