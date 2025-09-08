-- Function to automatically create Free subscription for new users
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  -- Insert a free subscription for the new user
  INSERT INTO public.subscriptions (
    user_id,
    plan_id,
    status,
    billing_cycle,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    'free-tier',
    'active',
    'monthly',
    NOW(),
    NOW()
  );
  
  -- Initialize monthly usage record
  INSERT INTO public.monthly_usage (
    user_id,
    year,
    month,
    workflow_count,
    execution_count,
    integration_count,
    storage_used_mb,
    team_member_count,
    ai_assistant_calls,
    ai_compose_uses,
    ai_agent_executions
  ) VALUES (
    NEW.id,
    EXTRACT(YEAR FROM NOW()),
    EXTRACT(MONTH FROM NOW()),
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.subscriptions TO authenticated;
GRANT ALL ON public.plans TO authenticated;
GRANT ALL ON public.monthly_usage TO authenticated;

-- RLS Policies for subscriptions table
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription
CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own subscription (for Stripe webhook)
CREATE POLICY "Service role can manage subscriptions" ON public.subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for plans table
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Everyone can view active plans
CREATE POLICY "Everyone can view active plans" ON public.plans
  FOR SELECT USING (is_active = true);

-- RLS Policies for monthly_usage table
ALTER TABLE public.monthly_usage ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage
CREATE POLICY "Users can view own usage" ON public.monthly_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage usage
CREATE POLICY "Service role can manage usage" ON public.monthly_usage
  FOR ALL USING (auth.role() = 'service_role');