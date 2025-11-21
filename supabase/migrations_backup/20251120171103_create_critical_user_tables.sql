-- =====================================================
-- CREATE CRITICAL USER TABLES
-- =====================================================
-- This migration creates the most critical missing tables
-- that are breaking 70+ routes in the application.
--
-- Tables created:
-- 1. user_profiles (119 refs) - Fixes auth/admin/teams
-- 2. plans (43 refs) - Subscription plans
-- 3. subscriptions (43 refs) - User subscriptions
-- =====================================================

BEGIN;

-- =====================================================
-- PART 1: RENAME PROFILES TO USER_PROFILES
-- =====================================================
-- The code uses 'user_profiles' but migration created 'profiles'
-- This renames it to match code expectations

DO $$
BEGIN
  -- Check if profiles table exists and user_profiles doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_profiles'
  ) THEN
    -- Rename the table
    ALTER TABLE public.profiles RENAME TO user_profiles;

    -- Rename all indexes
    ALTER INDEX IF EXISTS profiles_pkey RENAME TO user_profiles_pkey;
    ALTER INDEX IF EXISTS idx_profiles_email RENAME TO idx_user_profiles_email;

    -- Rename all policies
    DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
    CREATE POLICY "Users can view own profile"
      ON public.user_profiles FOR SELECT
      USING (auth.uid() = id);

    DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
    CREATE POLICY "Users can update own profile"
      ON public.user_profiles FOR UPDATE
      USING (auth.uid() = id);

    DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
    CREATE POLICY "Users can insert own profile"
      ON public.user_profiles FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- =====================================================
-- PART 2: CREATE PLANS TABLE
-- =====================================================
-- Subscription plans (Free, Pro, Enterprise, etc.)

CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC(10,2),
  price_yearly NUMERIC(10,2),
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly TEXT,
  stripe_product_id TEXT,
  features JSONB DEFAULT '[]',
  limits JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_name ON public.plans(name);
CREATE INDEX IF NOT EXISTS idx_plans_is_active ON public.plans(is_active);

-- Enable RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Anyone can view active plans
DROP POLICY IF EXISTS "Anyone can view active plans" ON public.plans;
CREATE POLICY "Anyone can view active plans"
  ON public.plans FOR SELECT
  USING (is_active = true);

-- Insert default plans
INSERT INTO public.plans (name, display_name, description, price_monthly, price_yearly, features, limits, sort_order)
VALUES
  (
    'free',
    'Free',
    'Perfect for getting started',
    0,
    0,
    '["Unlimited workflows", "100 runs per month", "Community support"]',
    '{"max_runs_per_month": 100, "max_workflows": -1, "max_team_members": 1}',
    1
  ),
  (
    'pro',
    'Pro',
    'For power users and small teams',
    29,
    290,
    '["Everything in Free", "10,000 runs per month", "Priority support", "Advanced integrations"]',
    '{"max_runs_per_month": 10000, "max_workflows": -1, "max_team_members": 5}',
    2
  ),
  (
    'enterprise',
    'Enterprise',
    'For large teams and organizations',
    NULL,
    NULL,
    '["Everything in Pro", "Unlimited runs", "Dedicated support", "Custom integrations", "SLA"]',
    '{"max_runs_per_month": -1, "max_workflows": -1, "max_team_members": -1}',
    3
  )
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- PART 3: CREATE SUBSCRIPTIONS TABLE
-- =====================================================
-- User subscription records

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.plans(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_team_id ON public.subscriptions(team_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON public.subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view own subscriptions
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (
    auth.uid() = user_id
    OR team_id IN (
      SELECT team_id FROM public.team_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can insert own subscriptions
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can insert own subscriptions"
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update own subscriptions
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can update own subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role has full access
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Service role can manage subscriptions"
  ON public.subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

-- =====================================================
-- POST-MIGRATION VERIFICATION
-- =====================================================
-- Run these queries to verify tables were created:
--
-- SELECT * FROM public.user_profiles LIMIT 1;
-- SELECT * FROM public.plans;
-- SELECT * FROM public.subscriptions LIMIT 1;
--
-- =====================================================
-- IMPACT
-- =====================================================
-- This migration fixes:
--  59 auth/admin/team routes (user_profiles rename)
--  11 billing routes (subscriptions + plans)
--  Total: 70+ routes restored
-- =====================================================
