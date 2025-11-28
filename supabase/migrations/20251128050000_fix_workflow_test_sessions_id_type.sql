-- Fix workflow_test_sessions.id column type from UUID to TEXT
-- This is needed because test sessions use generated IDs like "test-{workflowId}-{timestamp}"

-- Check if the table exists and the id column is UUID, then alter it
DO $$
BEGIN
  -- Check if the column exists and is UUID type
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workflow_test_sessions'
      AND column_name = 'id'
      AND data_type = 'uuid'
  ) THEN
    -- Drop and recreate the table with TEXT id (can't alter primary key type directly)
    -- First drop dependent policies
    DROP POLICY IF EXISTS "Users manage own workflow_test_sessions" ON public.workflow_test_sessions;
    DROP POLICY IF EXISTS "Service role access workflow_test_sessions" ON public.workflow_test_sessions;

    -- Truncate the table (test sessions are ephemeral anyway)
    TRUNCATE TABLE public.workflow_test_sessions;

    -- Drop the primary key constraint
    ALTER TABLE public.workflow_test_sessions DROP CONSTRAINT IF EXISTS workflow_test_sessions_pkey;

    -- Change the column type
    ALTER TABLE public.workflow_test_sessions
      ALTER COLUMN id TYPE TEXT USING id::TEXT;

    -- Re-add the primary key
    ALTER TABLE public.workflow_test_sessions
      ADD CONSTRAINT workflow_test_sessions_pkey PRIMARY KEY (id);

    -- Recreate policies
    CREATE POLICY "Users manage own workflow_test_sessions"
      ON public.workflow_test_sessions FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Service role access workflow_test_sessions"
      ON public.workflow_test_sessions FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');

    RAISE NOTICE 'Successfully converted workflow_test_sessions.id from UUID to TEXT';
  ELSE
    RAISE NOTICE 'workflow_test_sessions.id is already TEXT or table does not exist';
  END IF;
END $$;
