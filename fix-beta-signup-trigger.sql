-- First, drop the problematic trigger that's causing the 500 error
DROP TRIGGER IF EXISTS auto_confirm_beta_testers_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.auto_confirm_beta_testers();

-- Create a simpler, safer function that doesn't modify auth.users during insert
CREATE OR REPLACE FUNCTION public.handle_beta_tester_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log the signup, don't modify auth.users during the trigger
  -- Check if this is a beta tester
  IF (NEW.raw_user_meta_data->>'is_beta_tester')::boolean = true THEN
    -- Log the beta tester signup
    INSERT INTO public.beta_tester_activity (
      beta_tester_id,
      user_id,
      activity_type,
      activity_data
    )
    SELECT
      bt.id,
      NEW.id,
      'signed_up',
      jsonb_build_object(
        'email', NEW.email,
        'signed_up_at', NOW(),
        'via_beta_invite', true
      )
    FROM public.beta_testers bt
    WHERE bt.email = NEW.email;

    -- Update beta tester status to converted
    UPDATE public.beta_testers
    SET
      status = 'converted',
      last_active_at = NOW(),
      converted_to_paid_at = NOW()
    WHERE email = NEW.email
    AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER handle_beta_tester_signup_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_beta_tester_signup();

-- Create a separate function to confirm email that can be called after signup
CREATE OR REPLACE FUNCTION public.confirm_beta_tester_after_signup(user_email TEXT)
RETURNS void AS $$
BEGIN
  -- Confirm the user's email if they're a beta tester
  UPDATE auth.users u
  SET
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
  FROM public.beta_testers bt
  WHERE u.email = user_email
  AND bt.email = user_email
  AND bt.status IN ('active', 'converted')
  AND u.email_confirmed_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_beta_tester_signup() TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_beta_tester_after_signup(TEXT) TO anon, authenticated, service_role;

-- Fix any existing beta testers who might be stuck
UPDATE auth.users u
SET email_confirmed_at = NOW()
FROM public.beta_testers bt
WHERE u.email = bt.email
AND u.email_confirmed_at IS NULL
AND bt.status IN ('active', 'converted');