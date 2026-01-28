-- Drop unused tables (24 tables total)
-- These tables have no code references outside migrations
--
-- KEPT: AI tables (partner development)
-- KEPT: Enterprise/SSO tables (future)
-- KEPT: Template expansion tables (future)

-- Workflow tables (12)
DROP TABLE IF EXISTS public.workflow_changes CASCADE;
DROP TABLE IF EXISTS public.workflow_compositions CASCADE;
DROP TABLE IF EXISTS public.workflow_node_executions CASCADE;
DROP TABLE IF EXISTS public.workflow_node_outputs CASCADE;
DROP TABLE IF EXISTS public.workflow_permissions CASCADE;
DROP TABLE IF EXISTS public.workflow_prompts CASCADE;
DROP TABLE IF EXISTS public.workflow_queue CASCADE;
DROP TABLE IF EXISTS public.workflow_shares CASCADE;
DROP TABLE IF EXISTS public.workflow_test_runs CASCADE;
DROP TABLE IF EXISTS public.workflow_test_suites CASCADE;
DROP TABLE IF EXISTS public.workflow_trash_entries CASCADE;
DROP TABLE IF EXISTS public.workflows_schedules CASCADE;

-- Workflow V2/Revisions (6)
DROP TABLE IF EXISTS public.workflows_lineage CASCADE;
DROP TABLE IF EXISTS public.workflows_node_logs CASCADE;
DROP TABLE IF EXISTS public.workflows_published_revisions CASCADE;
DROP TABLE IF EXISTS public.workflows_run_nodes CASCADE;
DROP TABLE IF EXISTS public.workflows_runs CASCADE;
DROP TABLE IF EXISTS public.workflows_templates CASCADE;

-- Workspaces (3)
DROP TABLE IF EXISTS public.workspace_members CASCADE;
DROP TABLE IF EXISTS public.workspace_memberships CASCADE;
DROP TABLE IF EXISTS public.workspaces CASCADE;

-- User (2)
DROP TABLE IF EXISTS public.user_bases CASCADE;
DROP TABLE IF EXISTS public.user_trash_folders CASCADE;

-- Other (1)
DROP TABLE IF EXISTS public.api_usage_logs CASCADE;
