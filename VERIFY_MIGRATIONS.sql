-- =====================================================
-- VERIFY CRITICAL MIGRATIONS SUCCEEDED
-- =====================================================
-- Run this in Supabase Dashboard to confirm everything worked
-- =====================================================

-- 1. Check if user_profiles table exists and has data
SELECT 'user_profiles' as table_name, COUNT(*) as row_count FROM public.user_profiles;

-- 2. Check if plans were created
SELECT 'plans' as table_name, name, display_name, price_monthly, price_yearly FROM public.plans ORDER BY sort_order;

-- 3. Check if subscriptions table exists
SELECT 'subscriptions' as table_name, COUNT(*) as row_count FROM public.subscriptions;

-- 4. Check if organizations tables exist
SELECT 'organizations' as table_name, COUNT(*) as row_count FROM public.organizations;
SELECT 'organization_members' as table_name, COUNT(*) as row_count FROM public.organization_members;
SELECT 'organization_invitations' as table_name, COUNT(*) as row_count FROM public.organization_invitations;

-- =====================================================
-- EXPECTED RESULTS:
-- =====================================================
-- ✅ user_profiles: Should show count of existing users
-- ✅ plans: Should show 3 plans (free, pro, enterprise)
-- ✅ subscriptions: Should show 0 or more rows
-- ✅ organizations: Should show 0 or more rows
-- ✅ organization_members: Should show 0 or more rows
-- ✅ organization_invitations: Should show 0 or more rows
-- =====================================================
