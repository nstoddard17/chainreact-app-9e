-- This trigger ensures beta users have profiles created after signup
-- It runs AFTER INSERT to avoid conflicts with the auth process

-- Drop existing triggers/functions if they exist
DROP TRIGGER IF EXISTS ensure_beta_user_profile_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.ensure_beta_user_profile();

-- Create a function that creates profiles for beta users
CREATE OR REPLACE FUNCTION public.ensure_beta_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  v_username TEXT;
  v_full_name TEXT;
BEGIN
  -- Only process beta testers
  IF (NEW.raw_user_meta_data->>'is_beta_tester')::boolean = true THEN
    -- Extract username and full_name from user metadata
    v_username := NEW.raw_user_meta_data->>'username';
    v_full_name := NEW.raw_user_meta_data->>'full_name';

    -- Only proceed if we have a username
    IF v_username IS NOT NULL AND v_username != '' THEN
      -- Try to insert the profile (using UPSERT to handle race conditions)
      INSERT INTO public.user_profiles (
        id,
        username,
        full_name,
        role,
        provider,
        created_at,
        updated_at
      ) VALUES (
        NEW.id,
        v_username,
        v_full_name,
        'beta-pro',
        'email',
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        username = COALESCE(EXCLUDED.username, user_profiles.username),
        full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
        role = 'beta-pro',
        updated_at = NOW()
      WHERE user_profiles.username IS NULL OR user_profiles.username = '';

      RAISE LOG 'Beta user profile created/updated for user %', NEW.id;
    END IF;

    -- Auto-confirm email for beta testers
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
    WHERE id = NEW.id
    AND email_confirmed_at IS NULL;

    -- Update beta_testers table to mark as converted
    UPDATE public.beta_testers
    SET
      status = 'converted',
      conversion_date = NOW()
    WHERE email = NEW.email
    AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger that runs AFTER user creation
CREATE TRIGGER ensure_beta_user_profile_trigger
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.ensure_beta_user_profile();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.ensure_beta_user_profile() TO service_role;

-- Also create a function that can be called manually if needed
CREATE OR REPLACE FUNCTION public.fix_beta_user_profile(user_email TEXT)
RETURNS void AS $$
DECLARE
  v_user_id UUID;
  v_username TEXT;
  v_full_name TEXT;
BEGIN
  -- Get the user ID
  SELECT id, raw_user_meta_data->>'username', raw_user_meta_data->>'full_name'
  INTO v_user_id, v_username, v_full_name
  FROM auth.users
  WHERE email = user_email;

  IF v_user_id IS NOT NULL AND v_username IS NOT NULL THEN
    -- Upsert the profile
    INSERT INTO public.user_profiles (
      id,
      username,
      full_name,
      role,
      provider,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      v_username,
      v_full_name,
      'beta-pro',
      'email',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      username = COALESCE(EXCLUDED.username, user_profiles.username),
      full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
      role = 'beta-pro',
      updated_at = NOW();

    RAISE NOTICE 'Profile fixed for user %', user_email;
  ELSE
    RAISE NOTICE 'User not found or missing username for %', user_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.fix_beta_user_profile(TEXT) TO service_role;

-- Ensure RLS is properly configured
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'user_profiles'
    AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile" ON public.user_profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'user_profiles'
    AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile" ON public.user_profiles
      FOR UPDATE USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'user_profiles'
    AND policyname = 'Service role has full access'
  ) THEN
    CREATE POLICY "Service role has full access" ON public.user_profiles
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;