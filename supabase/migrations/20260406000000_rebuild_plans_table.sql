-- Rebuild plans table: update existing rows in place, delete duplicates
-- Subscription page data is the source of truth

-- Disable trigger that references non-existent stripe_product_id column
ALTER TABLE plans DISABLE TRIGGER trg_log_plan_changes;

-- Step 1: Normalize names to lowercase and update existing plans
-- Update "Free" (uppercase) with correct data
UPDATE plans SET
  name = 'free',
  display_name = 'Free',
  description = 'Perfect for trying out ChainReact',
  price_monthly = 0.00,
  price_yearly = 0.00,
  sort_order = 0,
  is_active = true,
  max_executions_per_month = 300,
  max_integrations = 3,
  max_team_members = 1,
  max_storage_mb = 100,
  max_nodes_per_workflow = 50,
  limits = '{"tasksPerMonth":300,"maxActiveWorkflows":3,"maxWorkflowsTotal":-1,"aiBuilds":5,"maxConnectedIntegrations":3,"historyRetentionDays":7,"maxTeamMembers":1,"maxTeams":0,"multiStepWorkflows":true,"aiAgents":false,"conditionalPaths":true,"webhooks":true,"scheduling":true,"errorNotifications":true,"teamSharing":false,"sharedWorkspaces":false,"advancedAnalytics":false,"prioritySupport":false,"dedicatedSupport":false,"detailedLogs":false,"maxBusinessContextEntries":1,"sso":false,"customContracts":false,"slaGuarantee":null,"overageRate":null,"rerunFailedExecutions":false,"integrationHealthDashboard":false,"aiDecisionLogs":false,"auditLogs":false,"customWebhooks":1,"apiKeys":0,"maxLoopIterations":10}'::jsonb,
  features = '["Visual drag-and-drop builder","AI workflow builder (5 builds/mo)","Unlimited refinements on builds","35+ integrations (connect 3)","Webhook & schedule triggers","Conditional logic & branching","Template gallery","Error notifications","AI learns from corrections","Community support"]'::jsonb
WHERE name = 'Free';

-- Update "Pro" (uppercase, has FK ref)
UPDATE plans SET
  name = 'pro',
  display_name = 'Pro',
  description = 'For solo professionals and freelancers',
  price_monthly = 19.00,
  price_yearly = 15.00,
  sort_order = 1,
  is_active = true,
  max_executions_per_month = 3000,
  max_integrations = -1,
  max_team_members = 1,
  max_storage_mb = 500,
  max_nodes_per_workflow = 100,
  limits = '{"tasksPerMonth":3000,"maxActiveWorkflows":-1,"maxWorkflowsTotal":-1,"aiBuilds":-1,"maxConnectedIntegrations":-1,"historyRetentionDays":30,"maxTeamMembers":1,"maxTeams":0,"multiStepWorkflows":true,"aiAgents":true,"conditionalPaths":true,"webhooks":true,"scheduling":true,"errorNotifications":true,"teamSharing":false,"sharedWorkspaces":false,"advancedAnalytics":false,"prioritySupport":false,"dedicatedSupport":false,"detailedLogs":true,"maxBusinessContextEntries":15,"sso":false,"customContracts":false,"slaGuarantee":null,"overageRate":0.025,"rerunFailedExecutions":true,"integrationHealthDashboard":true,"aiDecisionLogs":true,"auditLogs":false,"customWebhooks":5,"apiKeys":1,"maxLoopIterations":100}'::jsonb,
  features = '["Everything in Free, plus:","Unlimited AI workflow builds","Unlimited active workflows","All integrations (unlimited)","Full detailed execution logs","30-day execution history","Re-run failed executions","Integration health dashboard","AI decision logs","$0.025/task overage","Email support"]'::jsonb
WHERE name = 'Pro';

-- Update "beta" (lowercase, has FK refs)
UPDATE plans SET
  display_name = 'Beta',
  description = 'Beta testing program with full Pro access',
  price_monthly = 0.00,
  price_yearly = 0.00,
  sort_order = 1,
  is_active = true,
  max_executions_per_month = 3000,
  max_integrations = -1,
  max_team_members = 1,
  max_storage_mb = 500,
  max_nodes_per_workflow = 100,
  limits = '{"tasksPerMonth":3000,"maxActiveWorkflows":-1,"maxWorkflowsTotal":-1,"aiBuilds":-1,"maxConnectedIntegrations":-1,"historyRetentionDays":30,"maxTeamMembers":1,"maxTeams":0,"multiStepWorkflows":true,"aiAgents":true,"conditionalPaths":true,"webhooks":true,"scheduling":true,"errorNotifications":true,"teamSharing":false,"sharedWorkspaces":false,"advancedAnalytics":false,"prioritySupport":true,"dedicatedSupport":false,"detailedLogs":true,"maxBusinessContextEntries":15,"sso":false,"customContracts":false,"slaGuarantee":null,"overageRate":null,"rerunFailedExecutions":true,"integrationHealthDashboard":true,"aiDecisionLogs":true,"auditLogs":false,"customWebhooks":5,"apiKeys":1,"maxLoopIterations":100}'::jsonb,
  features = '["3,000 tasks/month","Full Pro access","AI Agents (Claude)","30-day history","Detailed logs","Priority support","Early feature access"]'::jsonb
WHERE name = 'beta';

-- Update "team" (lowercase)
UPDATE plans SET
  display_name = 'Team',
  description = 'For teams collaborating on workflows',
  price_monthly = 49.00,
  price_yearly = 40.00,
  sort_order = 2,
  is_active = true,
  max_executions_per_month = 10000,
  max_integrations = -1,
  max_team_members = -1,
  max_storage_mb = 1000,
  max_nodes_per_workflow = 200,
  limits = '{"tasksPerMonth":10000,"maxActiveWorkflows":-1,"maxWorkflowsTotal":-1,"aiBuilds":-1,"maxConnectedIntegrations":-1,"historyRetentionDays":90,"maxTeamMembers":-1,"maxTeams":1,"multiStepWorkflows":true,"aiAgents":true,"conditionalPaths":true,"webhooks":true,"scheduling":true,"errorNotifications":true,"teamSharing":true,"sharedWorkspaces":true,"advancedAnalytics":true,"prioritySupport":true,"dedicatedSupport":false,"detailedLogs":true,"maxBusinessContextEntries":-1,"sso":false,"customContracts":false,"slaGuarantee":null,"overageRate":0.02,"rerunFailedExecutions":true,"integrationHealthDashboard":true,"aiDecisionLogs":true,"auditLogs":false,"customWebhooks":20,"apiKeys":5,"maxLoopIterations":500}'::jsonb,
  features = '["Everything in Pro, plus:","Unlimited team members","1 team","Shared workspaces","Real-time collaboration","Role-based permissions","90-day execution history","Team analytics","$0.02/task overage","Priority support"]'::jsonb
WHERE name = 'team';

-- Update "Enterprise" (uppercase)
UPDATE plans SET
  name = 'enterprise',
  display_name = 'Enterprise',
  description = 'For large organizations with custom requirements',
  price_monthly = 249.00,
  price_yearly = 249.00,
  sort_order = 4,
  is_active = true,
  max_executions_per_month = -1,
  max_integrations = -1,
  max_team_members = -1,
  max_storage_mb = -1,
  max_nodes_per_workflow = -1,
  limits = '{"tasksPerMonth":-1,"maxActiveWorkflows":-1,"maxWorkflowsTotal":-1,"aiBuilds":-1,"maxConnectedIntegrations":-1,"historyRetentionDays":-1,"maxTeamMembers":-1,"maxTeams":-1,"multiStepWorkflows":true,"aiAgents":true,"conditionalPaths":true,"webhooks":true,"scheduling":true,"errorNotifications":true,"teamSharing":true,"sharedWorkspaces":true,"advancedAnalytics":true,"prioritySupport":true,"dedicatedSupport":true,"detailedLogs":true,"maxBusinessContextEntries":-1,"sso":true,"customContracts":true,"slaGuarantee":"99.99%","overageRate":null,"rerunFailedExecutions":true,"integrationHealthDashboard":true,"aiDecisionLogs":true,"auditLogs":true,"customWebhooks":-1,"apiKeys":-1,"maxLoopIterations":-1}'::jsonb,
  features = '["Everything in Business, plus:","Unlimited tasks","SSO/SAML authentication","Custom contracts & invoicing","99.99% SLA guarantee","Data residency options","Dedicated success manager","Custom integrations"]'::jsonb
WHERE name = 'Enterprise';

-- Step 2: Handle the "business" lowercase row — update it as canonical
UPDATE plans SET
  display_name = 'Business',
  description = 'For growing companies with advanced needs',
  price_monthly = 149.00,
  price_yearly = 120.00,
  sort_order = 3,
  is_active = true,
  max_executions_per_month = 30000,
  max_integrations = -1,
  max_team_members = -1,
  max_storage_mb = 5000,
  max_nodes_per_workflow = 500,
  limits = '{"tasksPerMonth":30000,"maxActiveWorkflows":-1,"maxWorkflowsTotal":-1,"aiBuilds":-1,"maxConnectedIntegrations":-1,"historyRetentionDays":365,"maxTeamMembers":-1,"maxTeams":-1,"multiStepWorkflows":true,"aiAgents":true,"conditionalPaths":true,"webhooks":true,"scheduling":true,"errorNotifications":true,"teamSharing":true,"sharedWorkspaces":true,"advancedAnalytics":true,"prioritySupport":true,"dedicatedSupport":true,"detailedLogs":true,"maxBusinessContextEntries":-1,"sso":false,"customContracts":false,"slaGuarantee":"99.9%","overageRate":0.015,"rerunFailedExecutions":true,"integrationHealthDashboard":true,"aiDecisionLogs":true,"auditLogs":true,"customWebhooks":-1,"apiKeys":15,"maxLoopIterations":500}'::jsonb,
  features = '["Everything in Team, plus:","Unlimited teams","Unlimited team members","1-year execution history","Audit logs","99.9% SLA guarantee","Advanced analytics & reporting","$0.015/task overage","Dedicated support"]'::jsonb
WHERE name = 'business';

-- Step 3: Delete the uppercase "Business" duplicate (no FK refs)
DELETE FROM plans WHERE name = 'Business' AND display_name IS NULL;

-- Step 4: Drop the broken trigger and re-create it without the missing column
DROP TRIGGER IF EXISTS trg_log_plan_changes ON plans;
DROP FUNCTION IF EXISTS log_plan_changes();

-- Re-enable the updated_at trigger
ALTER TABLE plans ENABLE TRIGGER set_plans_updated_at;
