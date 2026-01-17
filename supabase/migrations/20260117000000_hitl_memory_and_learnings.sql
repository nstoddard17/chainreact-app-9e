-- HITL Memory Table and Learnings Column
-- This migration adds/updates the hitl_memory table for caching AI learnings
-- and adds the learnings_extracted column to hitl_conversations

-- ============================================
-- 1. Ensure hitl_memory table has the correct structure
-- ============================================

-- Add missing columns to hitl_memory if the table exists
DO $$
BEGIN
  -- Check if table exists first
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'hitl_memory') THEN
    -- Add columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hitl_memory' AND column_name = 'user_id') THEN
      ALTER TABLE hitl_memory ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hitl_memory' AND column_name = 'workflow_id') THEN
      ALTER TABLE hitl_memory ADD COLUMN workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hitl_memory' AND column_name = 'scope') THEN
      ALTER TABLE hitl_memory ADD COLUMN scope TEXT DEFAULT 'workflow';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hitl_memory' AND column_name = 'category') THEN
      ALTER TABLE hitl_memory ADD COLUMN category TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hitl_memory' AND column_name = 'learning_summary') THEN
      ALTER TABLE hitl_memory ADD COLUMN learning_summary TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hitl_memory' AND column_name = 'learning_data') THEN
      ALTER TABLE hitl_memory ADD COLUMN learning_data JSONB DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hitl_memory' AND column_name = 'confidence_score') THEN
      ALTER TABLE hitl_memory ADD COLUMN confidence_score FLOAT DEFAULT 0.5;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hitl_memory' AND column_name = 'source_conversation_id') THEN
      ALTER TABLE hitl_memory ADD COLUMN source_conversation_id UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hitl_memory' AND column_name = 'usage_count') THEN
      ALTER TABLE hitl_memory ADD COLUMN usage_count INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hitl_memory' AND column_name = 'created_at') THEN
      ALTER TABLE hitl_memory ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hitl_memory' AND column_name = 'updated_at') THEN
      ALTER TABLE hitl_memory ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
  ELSE
    -- Create the table if it doesn't exist
    CREATE TABLE hitl_memory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
      scope TEXT DEFAULT 'workflow',
      category TEXT,
      learning_summary TEXT,
      learning_data JSONB DEFAULT '{}',
      confidence_score FLOAT DEFAULT 0.5,
      source_conversation_id UUID,
      usage_count INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  END IF;
END $$;

-- Create indexes if they don't exist (using DO block for safety)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_hitl_memory_user_id') THEN
    CREATE INDEX idx_hitl_memory_user_id ON hitl_memory(user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_hitl_memory_workflow_id') THEN
    CREATE INDEX idx_hitl_memory_workflow_id ON hitl_memory(workflow_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_hitl_memory_category') THEN
    CREATE INDEX idx_hitl_memory_category ON hitl_memory(category);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_hitl_memory_user_workflow') THEN
    CREATE INDEX idx_hitl_memory_user_workflow ON hitl_memory(user_id, workflow_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore errors if columns don't exist yet
  NULL;
END $$;

-- Enable RLS if not already enabled
ALTER TABLE hitl_memory ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to ensure they're correct
DROP POLICY IF EXISTS "Users can view their own HITL memory" ON hitl_memory;
DROP POLICY IF EXISTS "Users can insert their own HITL memory" ON hitl_memory;
DROP POLICY IF EXISTS "Users can update their own HITL memory" ON hitl_memory;
DROP POLICY IF EXISTS "Users can delete their own HITL memory" ON hitl_memory;
DROP POLICY IF EXISTS "Service role has full access to HITL memory" ON hitl_memory;

-- Recreate RLS policies
DO $$
BEGIN
  CREATE POLICY "Users can view their own HITL memory"
    ON hitl_memory FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can insert their own HITL memory"
    ON hitl_memory FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can update their own HITL memory"
    ON hitl_memory FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can delete their own HITL memory"
    ON hitl_memory FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Service role has full access to HITL memory"
    ON hitl_memory FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_hitl_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_hitl_memory_updated_at ON hitl_memory;
CREATE TRIGGER trigger_update_hitl_memory_updated_at
  BEFORE UPDATE ON hitl_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_hitl_memory_updated_at();

-- ============================================
-- 2. Add learnings_extracted column to hitl_conversations
-- ============================================
ALTER TABLE hitl_conversations
  ADD COLUMN IF NOT EXISTS learnings_extracted JSONB DEFAULT '{}';

-- ============================================
-- 3. Add external_user_id for tracking Discord/Slack user IDs
-- ============================================
ALTER TABLE hitl_conversations
  ADD COLUMN IF NOT EXISTS external_user_id TEXT;

-- Index for looking up by external user
CREATE INDEX IF NOT EXISTS idx_hitl_conversations_external_user
  ON hitl_conversations(external_user_id);

-- ============================================
-- 4. Add thread_id for threaded conversations
-- ============================================
ALTER TABLE hitl_conversations
  ADD COLUMN IF NOT EXISTS thread_id TEXT;

-- ============================================
-- 5. Add message_id for tracking the initial message
-- ============================================
ALTER TABLE hitl_conversations
  ADD COLUMN IF NOT EXISTS initial_message_id TEXT;
