-- Create waitlist table for early access signups
CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  selected_integrations JSONB DEFAULT '[]'::jsonb,
  custom_integrations JSONB DEFAULT '[]'::jsonb,
  wants_ai_assistant BOOLEAN DEFAULT true,
  wants_ai_actions BOOLEAN DEFAULT true,
  ai_actions_importance TEXT CHECK (ai_actions_importance IN ('not-important', 'somewhat-important', 'very-important', 'critical')) DEFAULT 'very-important',
  welcome_email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON public.waitlist(email);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON public.waitlist(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anonymous inserts (for public waitlist form)
CREATE POLICY "Allow anonymous inserts" ON public.waitlist
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Create policy to allow service role full access
CREATE POLICY "Service role has full access" ON public.waitlist
  FOR ALL
  TO service_role
  USING (true);

-- Create policy for authenticated users to view (admins only)
CREATE POLICY "Admins can view all" ON public.waitlist
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_waitlist_updated_at
  BEFORE UPDATE ON public.waitlist
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add comment to table
COMMENT ON TABLE public.waitlist IS 'Stores early access waitlist signups with their preferences';
