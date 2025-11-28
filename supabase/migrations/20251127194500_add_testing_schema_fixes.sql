-- Ensure schema supports live trigger testing and execution tracking

-- 1) Create workflow_test_sessions table if missing (used by live test mode)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'workflow_test_sessions'
  ) THEN
    CREATE TABLE public.workflow_test_sessions (
      id TEXT PRIMARY KEY,
      workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE,
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'listening',
      trigger_type TEXT,
      test_mode_config JSONB,
      execution_id UUID REFERENCES public.executions(id) ON DELETE SET NULL,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE public.workflow_test_sessions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create policies (drop first if exists to make idempotent)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users manage own workflow_test_sessions" ON public.workflow_test_sessions;
  CREATE POLICY "Users manage own workflow_test_sessions"
    ON public.workflow_test_sessions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN undefined_table THEN
    NULL; -- Table doesn't exist, skip
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Service role access workflow_test_sessions" ON public.workflow_test_sessions;
  CREATE POLICY "Service role access workflow_test_sessions"
    ON public.workflow_test_sessions FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
EXCEPTION
  WHEN undefined_table THEN
    NULL; -- Table doesn't exist, skip
END $$;

-- 2) Backfill missing columns on workflow_test_sessions when the table already exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = 'workflow_test_sessions'
  ) THEN
    ALTER TABLE public.workflow_test_sessions ADD COLUMN IF NOT EXISTS trigger_type TEXT;
    ALTER TABLE public.workflow_test_sessions ADD COLUMN IF NOT EXISTS test_mode_config JSONB;
    ALTER TABLE public.workflow_test_sessions ADD COLUMN IF NOT EXISTS execution_id UUID REFERENCES public.executions(id) ON DELETE SET NULL;
    ALTER TABLE public.workflow_test_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.workflow_test_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    ALTER TABLE public.workflow_test_sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
    ALTER TABLE public.workflow_test_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE public.workflow_test_sessions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'listening';
  END IF;
END $$;

-- 3) Helpful indexes for lookups used during trigger testing
CREATE INDEX IF NOT EXISTS idx_workflow_test_sessions_workflow_id ON public.workflow_test_sessions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_test_sessions_user_id ON public.workflow_test_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_test_sessions_status ON public.workflow_test_sessions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_test_sessions_trigger_type ON public.workflow_test_sessions(trigger_type);

-- 4) Add missing columns to executions table (started_at, completed_at)
ALTER TABLE public.executions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.executions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 5) Recreate workflow_executions view to include new columns
-- (The view is SELECT * FROM executions, so it will automatically pick up new columns)
CREATE OR REPLACE VIEW public.workflow_executions AS SELECT * FROM public.executions;
