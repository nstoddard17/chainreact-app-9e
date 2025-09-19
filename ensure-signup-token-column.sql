-- Ensure the signup_token column exists in beta_testers table
-- This is critical for the beta invitation flow to work

-- Add signup_token field to beta_testers table if it doesn't exist
ALTER TABLE beta_testers
ADD COLUMN IF NOT EXISTS signup_token text;

-- Add index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_beta_testers_signup_token ON beta_testers(signup_token);

-- Check if there are any beta testers without tokens and log them
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM beta_testers
        WHERE signup_token IS NULL
        AND conversion_offer_sent_at IS NOT NULL
    ) THEN
        RAISE NOTICE 'Found beta testers with offers sent but no signup tokens. Run the send-offer endpoint again for these users.';
    END IF;
END $$;

-- Grant necessary permissions
GRANT SELECT ON beta_testers TO authenticated;
GRANT SELECT ON beta_testers TO anon;