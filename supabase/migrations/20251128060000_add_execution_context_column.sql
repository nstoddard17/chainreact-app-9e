-- Add missing columns to workflow_execution_sessions table
-- These columns are required by the AdvancedExecutionEngine

-- First check if the table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'workflow_execution_sessions'
  ) THEN
    -- Add execution_context column if it doesn't exist
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS execution_context JSONB DEFAULT '{}'::jsonb;

    -- Add session_type column if it doesn't exist
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'manual';

    -- Add parallel_branches column if it doesn't exist
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS parallel_branches JSONB DEFAULT '[]'::jsonb;

    -- Add current_step column if it doesn't exist
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS current_step TEXT;

    -- Add progress_percentage column if it doesn't exist
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS progress_percentage NUMERIC DEFAULT 0;

    RAISE NOTICE 'Added missing columns to workflow_execution_sessions';
  ELSE
    RAISE NOTICE 'workflow_execution_sessions table does not exist';
  END IF;
END $$;
