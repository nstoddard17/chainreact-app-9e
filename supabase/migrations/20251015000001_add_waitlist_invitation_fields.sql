-- Add invitation tracking fields to waitlist table
ALTER TABLE public.waitlist
ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS signup_token TEXT,
ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('pending', 'invited', 'converted')) DEFAULT 'pending';

-- Create index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON public.waitlist(status);

-- Create index on invitation_sent_at for sorting
CREATE INDEX IF NOT EXISTS idx_waitlist_invitation_sent_at ON public.waitlist(invitation_sent_at DESC);

-- Add comment
COMMENT ON COLUMN public.waitlist.invitation_sent_at IS 'Timestamp when invitation email was sent to join the app';
COMMENT ON COLUMN public.waitlist.signup_token IS 'Unique token for signup verification';
COMMENT ON COLUMN public.waitlist.converted_at IS 'Timestamp when user actually signed up';
COMMENT ON COLUMN public.waitlist.status IS 'Current status: pending (not invited), invited (invitation sent), converted (signed up)';
