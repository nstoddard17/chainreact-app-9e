-- Create social_post_submissions table for tracking free task claims from social media posts
CREATE TABLE IF NOT EXISTS social_post_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_url TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'linkedin', 'x')),
  tasks_granted INTEGER NOT NULL DEFAULT 1500,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'deleted', 'invalid', 'revoked')),
  verification_date TIMESTAMPTZ,
  verification_attempts INTEGER DEFAULT 0,
  last_verification_attempt TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX idx_social_post_user_id ON social_post_submissions(user_id);
CREATE INDEX idx_social_post_status ON social_post_submissions(status);
CREATE INDEX idx_social_post_verification_date ON social_post_submissions(verification_date) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE social_post_submissions ENABLE ROW LEVEL SECURITY;

-- Policies
-- Users can view their own submissions
CREATE POLICY "Users can view own social post submissions"
  ON social_post_submissions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own submissions
CREATE POLICY "Users can create social post submissions"
  ON social_post_submissions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can update submissions (for verification)
CREATE POLICY "Service role can update social post submissions"
  ON social_post_submissions
  FOR UPDATE
  USING (true);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_social_post_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_social_post_submissions_updated_at
  BEFORE UPDATE ON social_post_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_social_post_submissions_updated_at();

-- Add comment
COMMENT ON TABLE social_post_submissions IS 'Tracks social media post submissions for free task rewards with delayed verification';
