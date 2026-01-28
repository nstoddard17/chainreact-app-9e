-- Drop unused flow_v2_* tables that were never implemented
-- These tables were created in migration 20251228000000_add_missing_flow_v2_tables.sql
-- but have 0 code references anywhere in the codebase

-- Drop tables with CASCADE to remove any dependent objects
DROP TABLE IF EXISTS public.flow_v2_revisions CASCADE;
DROP TABLE IF EXISTS public.flow_v2_runs CASCADE;
DROP TABLE IF EXISTS public.flow_v2_run_nodes CASCADE;
DROP TABLE IF EXISTS public.flow_v2_lineage CASCADE;
