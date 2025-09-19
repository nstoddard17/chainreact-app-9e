-- Fix profile creation for beta testers
-- This ensures profiles are created properly with all required fields

-- First, check the structure of user_profiles table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'user_profiles'
ORDER BY ordinal_position;

-- Drop the existing trigger temporarily
DROP TRIGGER IF EXISTS handle_beta_tester_signup_trigger ON auth.users;

-- Create an improved function that ensures profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create a profile for every new user
  INSERT INTO public.user_profiles (
    id,
    username,
    full_name,
    role,
    provider
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      SPLIT_PART(NEW.email, '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    ),
    CASE
      WHEN NEW.raw_user_meta_data->>'is_beta_tester' = 'true' THEN 'beta-pro'
      ELSE 'free'
    END,
    COALESCE(
      NEW.raw_app_meta_data->>'provider',
      'email'
    )
  )
  ON CONFLICT (id) DO UPDATE
  SET
    username = COALESCE(user_profiles.username, EXCLUDED.username),
    full_name = COALESCE(user_profiles.full_name, EXCLUDED.full_name),
    role = CASE
      WHEN NEW.raw_user_meta_data->>'is_beta_tester' = 'true' THEN 'beta-pro'
      ELSE user_profiles.role
    END,
    updated_at = NOW();

  -- Log beta tester activity if applicable
  IF NEW.raw_user_meta_data->>'is_beta_tester' = 'true' THEN
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
    WHERE bt.email = NEW.email
    ON CONFLICT DO NOTHING;

    -- Update beta tester status
    UPDATE public.beta_testers
    SET
      status = 'converted',
      last_active_at = NOW()
    WHERE email = NEW.email
    AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for all new users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT ALL ON public.user_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;

-- Fix any existing users without profiles
INSERT INTO public.user_profiles (id, username, full_name, role, provider)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'username',
    SPLIT_PART(u.email, '@', 1)
  ),
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    ''
  ),
  COALESCE(
    CASE
      WHEN bt.email IS NOT NULL THEN 'beta-pro'
      WHEN u.raw_user_meta_data->>'is_beta_tester' = 'true' THEN 'beta-pro'
      ELSE 'free'
    END,
    'free'
  ),
  COALESCE(
    u.raw_app_meta_data->>'provider',
    'email'
  )
FROM auth.users u
LEFT JOIN public.beta_testers bt ON bt.email = u.email
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_profiles p WHERE p.id = u.id
);