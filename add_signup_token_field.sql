-- Add signup_token field to beta_testers table if it doesn't exist
ALTER TABLE beta_testers
ADD COLUMN IF NOT EXISTS signup_token text;

-- Add index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_beta_testers_signup_token ON beta_testers(signup_token);