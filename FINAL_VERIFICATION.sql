-- =====================================================
-- FINAL VERIFICATION - Check All Tables Created
-- =====================================================
-- Run this to verify all tables exist
-- =====================================================

-- Count all public tables
SELECT COUNT(*) as total_tables
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE';

-- List critical tables we just created
SELECT table_name,
       (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_name IN (
  'user_profiles',
  'plans',
  'subscriptions',
  'organizations',
  'organization_members',
  'organization_invitations',
  'beta_testers',
  'templates',
  'workflow_files',
  'workflow_test_sessions',
  'microsoft_webhook_queue',
  'microsoft_graph_events',
  'ai_cost_logs',
  'ai_usage_logs',
  'webhook_registrations',
  'hitl_conversations',
  'support_tickets',
  'audit_logs'
)
ORDER BY table_name;

-- Check RLS is enabled on critical tables
SELECT tablename,
       CASE WHEN rowsecurity THEN 'Enabled' ELSE 'Disabled' END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('user_profiles', 'plans', 'subscriptions', 'organizations')
ORDER BY tablename;
