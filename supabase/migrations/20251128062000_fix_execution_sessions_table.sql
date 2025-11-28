-- Ensure workflow_execution_sessions table has all required columns
-- This table is used by the AdvancedExecutionEngine for workflow execution tracking

-- First, check if table exists and add all required columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'workflow_execution_sessions'
  ) THEN
    -- Add all potentially missing columns
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS workflow_id UUID;
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'manual';
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS execution_context JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS parallel_branches JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS current_step TEXT;
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS progress_percentage NUMERIC DEFAULT 0;
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.workflow_execution_sessions
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    RAISE NOTICE 'Added all required columns to workflow_execution_sessions';
  ELSE
    -- Create the table if it doesn't exist
    CREATE TABLE public.workflow_execution_sessions (
      id TEXT PRIMARY KEY,
      workflow_id UUID,
      user_id UUID,
      status TEXT DEFAULT 'pending',
      session_type TEXT DEFAULT 'manual',
      execution_context JSONB DEFAULT '{}'::jsonb,
      parallel_branches JSONB DEFAULT '[]'::jsonb,
      current_step TEXT,
      progress_percentage NUMERIC DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Enable RLS
    ALTER TABLE public.workflow_execution_sessions ENABLE ROW LEVEL SECURITY;

    -- Create policies
    CREATE POLICY "Users can manage own execution sessions"
      ON public.workflow_execution_sessions FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Service role access execution sessions"
      ON public.workflow_execution_sessions FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');

    RAISE NOTICE 'Created workflow_execution_sessions table with all required columns';
  END IF;
END $$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
