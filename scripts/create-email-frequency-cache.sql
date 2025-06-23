-- Create email_frequency_cache table for tracking email usage patterns
-- This table stores frequently used email addresses to improve autocomplete suggestions

CREATE TABLE IF NOT EXISTS email_frequency_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  frequency INTEGER NOT NULL DEFAULT 1,
  last_used TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL, -- 'gmail', 'outlook', etc.
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_frequency_cache_user_id ON email_frequency_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_email_frequency_cache_email ON email_frequency_cache(email);
CREATE INDEX IF NOT EXISTS idx_email_frequency_cache_source ON email_frequency_cache(source);
CREATE INDEX IF NOT EXISTS idx_email_frequency_cache_frequency ON email_frequency_cache(frequency DESC);
CREATE INDEX IF NOT EXISTS idx_email_frequency_cache_last_used ON email_frequency_cache(last_used DESC);

-- Create unique constraint to prevent duplicate entries per user/email/source
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_frequency_cache_unique 
ON email_frequency_cache(user_id, email, source);

-- Add RLS (Row Level Security) policies
ALTER TABLE email_frequency_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own email cache entries
CREATE POLICY "Users can access their own email cache" ON email_frequency_cache
  FOR ALL USING (auth.uid() = user_id);

-- Policy: Users can insert their own email cache entries
CREATE POLICY "Users can insert their own email cache" ON email_frequency_cache
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own email cache entries
CREATE POLICY "Users can update their own email cache" ON email_frequency_cache
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own email cache entries
CREATE POLICY "Users can delete their own email cache" ON email_frequency_cache
  FOR DELETE USING (auth.uid() = user_id);

-- Add comment for documentation
COMMENT ON TABLE email_frequency_cache IS 'Stores frequently used email addresses to improve autocomplete suggestions across integrations';
COMMENT ON COLUMN email_frequency_cache.email IS 'Email address (stored in lowercase)';
COMMENT ON COLUMN email_frequency_cache.name IS 'Display name associated with the email';
COMMENT ON COLUMN email_frequency_cache.frequency IS 'Number of times this email has been used';
COMMENT ON COLUMN email_frequency_cache.last_used IS 'Timestamp of last usage';
COMMENT ON COLUMN email_frequency_cache.source IS 'Integration source (gmail, outlook, etc.)';
COMMENT ON COLUMN email_frequency_cache.metadata IS 'Additional metadata like photo URLs, aliases, etc.'; 