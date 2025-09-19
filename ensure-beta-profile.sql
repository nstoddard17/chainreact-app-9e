-- Ensure beta testers get proper user profiles created
-- This updates the trigger to also create the user profile

-- Update the beta tester signup handler to create profile
CREATE OR REPLACE FUNCTION public.handle_beta_tester_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process beta testers
  IF (NEW.raw_user_meta_data->>'is_beta_tester')::boolean = true THEN
    -- Create the user profile with the username from metadata
    INSERT INTO public.user_profiles (
      id,
      username,
      full_name,
      role,
      provider,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'username', NEW.email),
      NEW.raw_user_meta_data->>'full_name',
      'beta-pro',
      'email',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
      username = COALESCE(EXCLUDED.username, user_profiles.username),
      full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
      role = 'beta-pro',
      updated_at = NOW();

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
        'via_beta_invite', true,
        'username', NEW.raw_user_meta_data->>'username'
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

-- Recreate the trigger
DROP TRIGGER IF EXISTS handle_beta_tester_signup_trigger ON auth.users;
CREATE TRIGGER handle_beta_tester_signup_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_beta_tester_signup();

-- Fix any existing beta testers who don't have profiles
INSERT INTO public.user_profiles (id, username, full_name, role, provider, created_at, updated_at)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'username', u.email),
  u.raw_user_meta_data->>'full_name',
  'beta-pro',
  'email',
  u.created_at,
  NOW()
FROM auth.users u
JOIN public.beta_testers bt ON bt.email = u.email
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_profiles p WHERE p.id = u.id
)
AND bt.status IN ('active', 'converted')
ON CONFLICT (id) DO UPDATE
SET
  role = 'beta-pro',
  updated_at = NOW();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_beta_tester_signup() TO service_role;