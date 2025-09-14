-- Function to increment beta tester statistics
CREATE OR REPLACE FUNCTION increment_beta_tester_stat(
  tester_email text,
  stat_name text,
  increment_by integer DEFAULT 1
)
RETURNS void AS $$
BEGIN
  IF stat_name = 'total_workflows_created' THEN
    UPDATE beta_testers
    SET total_workflows_created = COALESCE(total_workflows_created, 0) + increment_by,
        last_active_at = now()
    WHERE email = tester_email;
  ELSIF stat_name = 'total_executions' THEN
    UPDATE beta_testers
    SET total_executions = COALESCE(total_executions, 0) + increment_by,
        last_active_at = now()
    WHERE email = tester_email;
  ELSIF stat_name = 'feedback_count' THEN
    UPDATE beta_testers
    SET feedback_count = COALESCE(feedback_count, 0) + increment_by,
        last_active_at = now()
    WHERE email = tester_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically assign beta-pro role when user signs up with beta tester email
CREATE OR REPLACE FUNCTION assign_beta_role_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if email exists in beta_testers table with active status
  IF EXISTS (
    SELECT 1 FROM beta_testers
    WHERE email = NEW.email
    AND status = 'active'
  ) THEN
    -- Update the user's role to beta-pro
    UPDATE user_profiles
    SET role = 'beta-pro'
    WHERE id = NEW.id;

    -- Log the activity
    INSERT INTO beta_tester_activity (
      beta_tester_id,
      user_id,
      activity_type,
      activity_data
    )
    SELECT
      bt.id,
      NEW.id,
      'role_assigned',
      jsonb_build_object('automatic', true, 'triggered_by', 'signup')
    FROM beta_testers bt
    WHERE bt.email = NEW.email;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signups
DROP TRIGGER IF EXISTS assign_beta_role_trigger ON auth.users;
CREATE TRIGGER assign_beta_role_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION assign_beta_role_on_signup();

-- Also create trigger for profile creation (in case it's created separately)
DROP TRIGGER IF EXISTS assign_beta_role_on_profile_trigger ON user_profiles;
CREATE TRIGGER assign_beta_role_on_profile_trigger
  AFTER INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION assign_beta_role_on_signup();