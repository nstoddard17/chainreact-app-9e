-- Migration: Fix execution tables to match expected schema
-- This migration:
-- 1. Adds missing columns to executions table (workflow_executions is a view)
-- 2. Creates workflow_node_executions table
-- 3. Sets up proper RLS policies

-- ============================================
-- Fix executions table columns (workflow_executions is a VIEW to this table)
-- ============================================

-- Add missing columns if they don't exist
ALTER TABLE executions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS input_data JSONB;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS output_data JSONB;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS execution_time_ms INTEGER;

-- Update user_id from workflow_id for existing records
UPDATE executions
SET user_id = workflows.user_id
FROM workflows
WHERE executions.workflow_id = workflows.id
  AND executions.user_id IS NULL;

-- Enable RLS if not already enabled
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;

-- Update RLS policies for executions table
DROP POLICY IF EXISTS "Users can view own workflow executions" ON executions;
DROP POLICY IF EXISTS "Users can insert own workflow executions" ON executions;
DROP POLICY IF EXISTS "Users can update own workflow executions" ON executions;
DROP POLICY IF EXISTS "Users can delete own workflow executions" ON executions;
DROP POLICY IF EXISTS "Service role can access all workflow executions" ON executions;

-- Recreate policies on the executions table
CREATE POLICY "Users can view own workflow executions"
  ON executions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workflow executions"
  ON executions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workflow executions"
  ON executions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own workflow executions"
  ON executions FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can access all records (for backend operations)
CREATE POLICY "Service role can access all workflow executions"
  ON executions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Create workflow_node_executions table
-- ============================================

CREATE TABLE IF NOT EXISTS workflow_node_executions (
  id TEXT PRIMARY KEY,
  execution_id UUID REFERENCES executions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  status TEXT NOT NULL,
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  CHECK (status IN ('pending', 'running', 'success', 'error', 'skipped'))
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_workflow_node_executions_execution_id
  ON workflow_node_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_node_executions_node_id
  ON workflow_node_executions(node_id);
CREATE INDEX IF NOT EXISTS idx_workflow_node_executions_status
  ON workflow_node_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_node_executions_started_at
  ON workflow_node_executions(started_at DESC);

-- Enable RLS
ALTER TABLE workflow_node_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflow_node_executions
-- Users can view node executions for their own workflow executions
CREATE POLICY "Users can view own workflow node executions"
  ON workflow_node_executions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM executions e
      WHERE e.id = workflow_node_executions.execution_id
      AND e.user_id = auth.uid()
    )
  );

-- Users can insert node executions for their own workflow executions
CREATE POLICY "Users can insert own workflow node executions"
  ON workflow_node_executions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM executions e
      WHERE e.id = workflow_node_executions.execution_id
      AND e.user_id = auth.uid()
    )
  );

-- Users can update node executions for their own workflow executions
CREATE POLICY "Users can update own workflow node executions"
  ON workflow_node_executions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM executions e
      WHERE e.id = workflow_node_executions.execution_id
      AND e.user_id = auth.uid()
    )
  );

-- Users can delete node executions for their own workflow executions
CREATE POLICY "Users can delete own workflow node executions"
  ON workflow_node_executions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM executions e
      WHERE e.id = workflow_node_executions.execution_id
      AND e.user_id = auth.uid()
    )
  );

-- Service role can access all records (for backend operations)
CREATE POLICY "Service role can access all workflow node executions"
  ON workflow_node_executions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Add comments
-- ============================================

COMMENT ON TABLE workflow_node_executions IS 'Stores individual node execution details for each workflow run';
COMMENT ON COLUMN workflow_node_executions.execution_id IS 'Foreign key to workflow_executions.id';
COMMENT ON COLUMN workflow_node_executions.input_data IS 'All input variables passed to this node';
COMMENT ON COLUMN workflow_node_executions.output_data IS 'All output variables produced by this node';
