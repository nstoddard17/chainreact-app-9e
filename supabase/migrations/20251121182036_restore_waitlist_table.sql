-- Restore waitlist table with all required columns
-- The table was previously reduced to only: id, email, created_at, status
-- This migration adds back all the columns needed by the waitlist API

-- Add missing columns to the waitlist table
ALTER TABLE waitlist
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS selected_integrations TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS custom_integrations TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS wants_ai_assistant BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS wants_ai_actions BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS ai_actions_importance TEXT DEFAULT 'very-important',
ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

-- Add check constraint for ai_actions_importance enum values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_ai_actions_importance_check'
  ) THEN
    ALTER TABLE waitlist
    ADD CONSTRAINT waitlist_ai_actions_importance_check
    CHECK (ai_actions_importance IN ('not-important', 'somewhat-important', 'very-important', 'critical'));
  END IF;
END $$;

-- Create index on email for faster lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);

-- Create index on status for filtering (if not exists)
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);

-- Create index on created_at for sorting (if not exists)
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist(created_at DESC);

-- Enable RLS on waitlist table
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "Service role can manage waitlist" ON waitlist;
DROP POLICY IF EXISTS "Anon can insert into waitlist" ON waitlist;

-- Allow service role full access
CREATE POLICY "Service role can manage waitlist"
ON waitlist
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow anonymous users to insert (for public waitlist form)
CREATE POLICY "Anon can insert into waitlist"
ON waitlist
FOR INSERT
TO anon
WITH CHECK (true);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_waitlist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS waitlist_updated_at_trigger ON waitlist;

CREATE TRIGGER waitlist_updated_at_trigger
BEFORE UPDATE ON waitlist
FOR EACH ROW
EXECUTE FUNCTION update_waitlist_updated_at();

-- Add comment to table
COMMENT ON TABLE waitlist IS 'Stores waitlist signups from the public landing page';
