-- Auto-confirm email for beta testers upon signup
-- This trigger automatically confirms the email for users who sign up as beta testers

-- Create a function to auto-confirm beta testers
CREATE OR REPLACE FUNCTION public.auto_confirm_beta_testers()
RETURNS TRIGGER AS $$
BEGIN
  -- Only auto-confirm if:
  -- 1. User has is_beta_tester flag in their metadata
  -- 2. Email exists in beta_testers table with valid status
  -- 3. Beta tester has a valid signup_token (meaning they came through the invite link)
  IF (NEW.raw_user_meta_data->>'is_beta_tester')::boolean = true AND EXISTS (
    SELECT 1 FROM public.beta_testers
    WHERE email = NEW.email
    AND status IN ('active', 'converted')
    AND signup_token IS NOT NULL  -- Must have gone through the invitation flow
  ) THEN
    -- Update the user to be confirmed
    UPDATE auth.users
    SET
      email_confirmed_at = NOW(),
      confirmation_token = NULL,
      updated_at = NOW()
    WHERE id = NEW.id;

    -- Log the auto-confirmation
    INSERT INTO public.beta_tester_activity (
      beta_tester_id,
      user_id,
      activity_type,
      activity_data
    )
    SELECT
      bt.id,
      NEW.id,
      'auto_confirmed',
      jsonb_build_object(
        'email', NEW.email,
        'confirmed_at', NOW(),
        'via_beta_invite', true
      )
    FROM public.beta_testers bt
    WHERE bt.email = NEW.email;

    -- Mark that the invitation was used but keep the token for reference
    UPDATE public.beta_testers
    SET
      last_active_at = NOW(),
      status = CASE
        WHEN status = 'active' THEN 'converted'
        ELSE status
      END
    WHERE email = NEW.email;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS auto_confirm_beta_testers_trigger ON auth.users;

-- Create trigger for new user signups
CREATE TRIGGER auto_confirm_beta_testers_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_confirm_beta_testers();

-- Also create a function that can be called directly to confirm a beta tester
CREATE OR REPLACE FUNCTION public.confirm_beta_tester_email(user_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_id UUID;
BEGIN
  -- Check if user exists and is a beta tester
  SELECT u.id INTO user_id
  FROM auth.users u
  JOIN public.beta_testers bt ON bt.email = u.email
  WHERE u.email = user_email
  AND bt.status IN ('active', 'converted');

  IF user_id IS NOT NULL THEN
    -- Confirm the email
    UPDATE auth.users
    SET
      email_confirmed_at = NOW(),
      confirmation_token = NULL,
      updated_at = NOW()
    WHERE id = user_id;

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.auto_confirm_beta_testers() TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_beta_tester_email(TEXT) TO anon, authenticated;