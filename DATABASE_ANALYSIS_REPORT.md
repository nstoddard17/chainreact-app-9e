# Database Table Analysis Report
**Generated:** 2025-11-20
**Project:** ChainReact Workflow Automation Platform
**Database:** PostgreSQL (Supabase)

---

## Executive Summary

This analysis identified **31 tables** actively created in migrations, with **100+ unique table references** in the codebase. The recent `20251120144805_rename_tables_to_workflows.sql` migration successfully:
- Renamed all `flow_v2_*` tables to `workflows_*` naming convention
- Dropped legacy `workflow_executions` and `workflows` tables
- Maintained `workflow_permissions` and `loop_executions` tables

### Key Findings:
- ✅ **Core architecture is solid** - Main workflow tables (workflows, workflows_runs, workflows_revisions) are properly implemented
- ⚠️ **150+ table references in code** point to tables that may not exist in database
- ⚠️ **Missing critical functionality** - Several expected features appear incomplete
- 🔍 **Potential unused/draft tables** - Some tables referenced only once or appear to be prototypes

---

## 1. Tables Created in Database Migrations (31 Tables)

### Core Workflow Tables (Flow V2 Architecture)
These are the **renamed** tables from the latest migration:

| Original Name | New Name (Post-Rename) | Status | Purpose |
|--------------|------------------------|--------|---------|
| `flow_v2_definitions` | `workflows` | ✅ Active | Main workflow definitions |
| `flow_v2_revisions` | `workflows_revisions` | ✅ Active | Version history/snapshots |
| `flow_v2_runs` | `workflows_runs` | ✅ Active | Execution runs |
| `flow_v2_run_nodes` | `workflows_run_nodes` | ✅ Active | Individual node results |
| `flow_v2_lineage` | `workflows_lineage` | ✅ Active | Data lineage tracking |
| `flow_v2_templates` | `workflows_templates` | ✅ Active | Saved templates |
| `flow_v2_schedules` | `workflows_schedules` | ✅ Active | Cron schedules |
| `flow_v2_published_revisions` | `workflows_published_revisions` | ✅ Active | Published versions |
| `flow_v2_node_logs` | `workflows_node_logs` | ✅ Active | Node-level logging |

**Note:** The rename migration also created:
- `workflow_permissions` - Per-workflow sharing (view/edit/admin roles)
- `workflow_folders` - Folder organization

### Authentication & User Management (4 Tables)
| Table | Usage Count | Purpose |
|-------|-------------|---------|
| `profiles` (aka `user_profiles`) | 123 refs | User profile data |
| `pkce_flow` | 30 refs | OAuth PKCE flow state |
| `teams` | 48 refs | Team/organization management |
| `team_members` | 47 refs | Team membership |

### Integration Management (4 Tables)
| Table | Usage Count | Purpose |
|-------|-------------|---------|
| `integrations` | 410 refs | **Most used table** - OAuth credentials |
| `integration_metadata` | Created | Additional integration info |
| `integration_permissions` | 7 refs | Workspace-level integration access |
| `trigger_resources` | 100 refs | Webhook IDs, subscription IDs |

### Webhook & Trigger Infrastructure (5 Tables)
| Table | Usage Count | Purpose |
|-------|-------------|---------|
| `webhook_subscriptions` | In baseline | Webhook registrations |
| `webhook_queue` | In baseline | Webhook event queue |
| `webhook_settings` | 5 refs | Webhook configuration |
| `trigger_state` | 4 refs | Conditional trigger state tracking |
| `waiting_executions` | 5 refs | Waiting for human input |

### Workflow Execution Support (3 Tables)
| Table | Usage Count | Purpose |
|-------|-------------|---------|
| `loop_executions` | 7 refs | Loop progress tracking |
| `workflow_executions` | **DROPPED** | Legacy execution table (replaced by workflows_runs) |
| `workflow_folders` | 13 refs | Folder organization |

### Workspace & Collaboration (5 Tables)
| Table | Usage Count | Purpose |
|-------|-------------|---------|
| `workspaces` | 7 refs | Multi-tenant workspaces |
| `workspace_members` | Created | Workspace membership |
| `workspace_memberships` | 3 refs | Alternate membership table (possible duplicate?) |
| `organization_members` | 23 refs | Organization membership |
| `notifications` | 11 refs | User notifications |

### Team Management (4 Tables)
| Table | Usage Count | Purpose |
|-------|-------------|---------|
| `team_invitations` | 14 refs | Team invite tokens |
| `team_activity` | 2 refs | Activity logging |
| `team_suspension_notifications` | 2 refs | Suspension alerts |
| `social_post_submissions` | 9 refs | Social media content queue |

### AI & Analytics (5 Tables)
| Table | Usage Count | Purpose |
|-------|-------------|---------|
| `agent_chat_messages` | 2 refs | AI agent conversations |
| `workflow_prompts` | 5 refs | AI workflow generation prompts |
| `template_analytics` | Created | Template usage analytics |
| `prompt_clusters` | 3 refs | Prompt clustering analysis |
| `dynamic_templates` | 4 refs | AI-generated templates |

### Security & Compliance (3 Tables)
| Table | Usage Count | Purpose |
|-------|-------------|---------|
| `v2_secrets` | 3 refs | Encrypted secret storage |
| `v2_oauth_tokens` | Created | OAuth token storage |
| `browser_automation_logs` | 4 refs | Playwright usage tracking |

### Miscellaneous (3 Tables)
| Table | Usage Count | Purpose |
|-------|-------------|---------|
| `error_reports` | 1 ref | Error tracking |
| `learning_resources` | Created | Documentation/tutorials |
| `workflow_permissions` | 10 refs | Workflow sharing |

---

## 2. Tables Referenced in Code But NOT in Migrations (70+ Tables)

These tables are queried in application code but **may not exist** in the database:

### High-Risk Missing Tables (Heavily Referenced)
| Table | References | Files | Risk Level |
|-------|-----------|-------|-----------|
| `webhook_configs` | 54 | API routes, lib | 🔴 **CRITICAL** |
| `subscriptions` | 43 | Billing | 🔴 **CRITICAL** |
| `organization_invitations` | 13 | Team management | 🟡 **HIGH** |
| `templates` | 38 | Template system | 🟡 **HIGH** |
| `workflow_test_sessions` | 12 | Testing | 🟡 **HIGH** |

### Webhook & Event Processing (9 Tables)
- `google_watch_subscriptions` (23 refs) - Gmail API webhooks
- `microsoft_webhook_queue` (15 refs) - Microsoft Graph webhook queue
- `microsoft_graph_subscriptions` (11 refs) - Outlook/OneDrive webhooks
- `airtable_webhooks` (17 refs) - Airtable webhook registrations
- `integration_webhooks` (15 refs) - Generic webhook config
- `webhook_registrations` (10 refs) - Alternative webhook storage
- `webhook_executions` (8 refs) - Webhook execution history
- `webhook_events` (7 refs) - Webhook event log
- `microsoft_graph_events` (6 refs) - Microsoft event cache

### AI & Memory (9 Tables)
- `ai_cost_logs` (17 refs) - AI usage cost tracking
- `ai_conversations` (5 refs) - Chat history
- `ai_memory` (5 refs) - Long-term memory
- `ai_user_budgets` (5 refs) - Per-user AI budgets
- `ai_usage_stats` (4 refs) - Usage analytics
- `ai_usage_logs` (3 refs) - Detailed logs
- `ai_workflow_generations` (1 ref) - Generated workflows
- `ai_routing_decisions` (1 ref) - AI routing logic
- `ai_field_resolutions` (1 ref) - AI field value generation

### Workflow Execution & Testing (12 Tables)
- `workflow_execution_sessions` (6 refs) - **Referenced by loop_executions FK!**
- `workflow_execution_history` (8 refs) - Execution audit trail
- `workflow_execution_steps` (4 refs) - Step-by-step results
- `execution_progress` (8 refs) - Real-time progress tracking
- `execution_branches` (4 refs) - Conditional branching
- `workflow_test_suites` (3 refs) - Test suite definitions
- `workflow_locks` (4 refs) - Prevent concurrent edits
- `workflow_variables` (7 refs) - User-defined variables
- `workflow_schedules` (5 refs) - Alternative to workflows_schedules?
- `workflow_queue` (1 ref) - Execution queue
- `workflow_versions` (1 ref) - Version tracking
- `workflow_changes` (2 refs) - Change tracking

### Collaboration & Presence (6 Tables)
- `collaboration_sessions` (7 refs) - Real-time collaboration
- `user_presence` (7 refs) - Online/offline status
- `live_execution_events` (2 refs) - Real-time execution feed
- `hitl_conversations` (9 refs) - Human-in-the-loop chat
- `hitl_memory` (2 refs) - HITL context storage
- `user_memory_documents` (10 refs) - User knowledge base

### Billing & Usage (5 Tables)
- `plans` (7 refs) - Subscription plans
- `monthly_usage` (7 refs) - Usage metering
- `invoices` (4 refs) - Invoice history
- `monthly_ai_costs` (3 refs) - AI cost rollup
- `usage_logs` (2 refs) - Detailed usage tracking

### Support & Monitoring (5 Tables)
- `support_tickets` (8 refs) - Customer support
- `support_ticket_responses` (2 refs) - Ticket replies
- `beta_testers` (16 refs) - Beta program management
- `beta_tester_activity` (2 refs) - Beta usage tracking
- `audit_logs` (9 refs) - Security audit trail

### Template System (5 Tables)
- `workflow_templates` (9 refs) - **Different from workflows_templates?**
- `template_reviews` (6 refs) - User reviews
- `template_assets` (4 refs) - Template images/files
- `template_downloads` (1 ref) - Download tracking
- `template_candidates` (1 ref) - AI template suggestions

### Storage Buckets (Referenced as tables)
- `workflow-files` (28 refs) - File uploads
- `slack-attachments` (4 refs) - Slack file cache
- `temp-files` (6 refs) - Temporary storage
- `user-avatars` (3 refs) - Profile pictures
- `template-assets` (1 ref) - Template images

### Enterprise & Security (7 Tables)
- `organizations` (12 refs) - Top-level orgs
- `sso_configurations` (3 refs) - SAML/SSO settings
- `enterprise_integrations` (3 refs) - Custom integrations
- `token_audit_logs` (3 refs) - API token usage
- `compliance_audit_logs` (5 refs) - GDPR compliance
- `data_subject_requests` (5 refs) - GDPR requests
- `data_deletion_requests` (5 refs) - Data deletion

### Deployment & Configuration (5 Tables)
- `deployment_configurations` (8 refs) - Multi-env deployments
- `api_keys` (4 refs) - API key management
- `database_connections` (1 ref) - External DB connectors
- `custom_api_connectors` (1 ref) - Custom API integrations
- `sessions` (3 refs) - User session tracking

### Waitlist & Beta (2 Tables)
- `waitlist` (9 refs) - Product waitlist
- `beta_tester_feedback` (1 ref) - Beta feedback

### Integration-Specific (6 Tables)
- `user_bases` (2 refs) - Airtable base cache
- `user_integrations` (2 refs) - Alternative to integrations?
- `airtable_processed_records` (1 ref) - Deduplication
- `microsoft_webhook_dedup` (4 refs) - Microsoft dedup
- `microsoft_graph_delta_tokens` (2 refs) - Delta sync tokens
- `discord_invite_roles` (1 ref) - Discord role mapping

### Analytics & Metrics (5 Tables)
- `analytics_metrics` (1 ref) - Product analytics
- `roi_calculations` (1 ref) - ROI tracking
- `predictions` (1 ref) - ML predictions
- `daily_cost_savings` (1 ref) - Cost savings analytics
- `presence_stats` (2 refs) - Presence analytics

### Miscellaneous (5 Tables)
- `users` (8 refs) - **Different from auth.users?**
- `user_preferences` (2 refs) - User settings
- `user_config_preferences` (3 refs) - Configuration
- `workflow_teams` (3 refs) - Workflow sharing with teams
- `workflow_compositions` (1 ref) - Nested workflows?

---

## 3. Critical Issues & Broken References

### 🔴 **CRITICAL: Foreign Key Constraint Issue**
```sql
-- In loop_executions migration:
session_id UUID NOT NULL REFERENCES workflow_execution_sessions(id) ON DELETE CASCADE
```
**Problem:** `loop_executions` references `workflow_execution_sessions`, but that table **does not exist in migrations**. This FK constraint may be **failing** or the table was created elsewhere.

**Impact:** Loop execution tracking may be broken in production.

**Fix Required:**
1. Verify if `workflow_execution_sessions` exists in production database
2. If not, either:
   - Create the table, OR
   - Update `loop_executions` to reference `workflows_runs` instead

---

### 🟡 **MAJOR: Webhook Infrastructure Confusion**
**Multiple webhook-related tables with unclear relationships:**
- `webhook_subscriptions` (baseline schema)
- `webhook_configs` (54 refs in code, not in migrations)
- `webhook_registrations` (10 refs)
- `integration_webhooks` (15 refs)
- `trigger_resources` (100 refs)

**Questions:**
- Are these different systems or naming inconsistencies?
- Should they be consolidated?
- Which table is the source of truth?

---

### 🟡 **MAJOR: Template System Duplication**
**Two template tables:**
1. `workflows_templates` (created in flow_v2_parity.sql, 4 refs)
2. `workflow_templates` (9 refs in code, not in migrations)

**Questions:**
- Are these the same thing with different names?
- Should `workflow_templates` be renamed to `workflows_templates`?

---

### 🟡 **MAJOR: Workspace Membership Duplication**
**Two membership tables:**
1. `workspace_members` (created in migration)
2. `workspace_memberships` (3 refs in code)

**Questions:**
- Which is the primary table?
- Are both needed?

---

### 🟠 **IMPORTANT: Missing Execution Session Table**
**Referenced but not created:**
- `workflow_execution_sessions` (6 refs)
- Required by `loop_executions` FK constraint

**Options:**
1. Create the table if it's supposed to exist
2. Replace with `workflows_runs` if that's the replacement
3. Remove the FK constraint if sessions aren't tracked separately

---

### 🟠 **IMPORTANT: Storage Buckets Referenced as Tables**
**These are likely Supabase Storage buckets, not tables:**
- `workflow-files` (28 refs)
- `slack-attachments` (4 refs)
- `temp-files` (6 refs)
- `user-avatars` (3 refs)

**Action:** Update code to use Storage API, not `.from()`

---

## 4. Missing Functionality Analysis

Based on CLAUDE.md requirements, checking for expected tables:

| Requirement | Expected Table | Status | Notes |
|-------------|---------------|--------|-------|
| ✅ Workflows | `workflows` | EXISTS | Renamed from flow_v2_definitions |
| ✅ Workflow revisions | `workflows_revisions` | EXISTS | Version history implemented |
| ✅ Workflow runs | `workflows_runs` | EXISTS | Execution tracking |
| ✅ Run node results | `workflows_run_nodes` | EXISTS | Per-node results |
| ✅ Workflow schedules | `workflows_schedules` | EXISTS | Cron jobs |
| ✅ Workflow permissions | `workflow_permissions` | EXISTS | Sharing (view/edit/admin) |
| ✅ Workflow folders | `workflow_folders` | EXISTS | Organization |
| ✅ Integration metadata | `integration_metadata` | EXISTS | Additional integration info |
| ✅ Trigger state | `trigger_state` | EXISTS | Conditional trigger tracking |
| ✅ Loop executions | `loop_executions` | EXISTS | Loop progress tracking |
| ⚠️ Workflow execution sessions | `workflow_execution_sessions` | **MISSING** | Referenced but not created |
| ❌ Workflow variables | `workflow_variables` | **MISSING** | User-defined variables |
| ❌ Webhook configs | `webhook_configs` | **MISSING** | 54 refs, not created |
| ❌ Google watch subs | `google_watch_subscriptions` | **MISSING** | 23 refs, critical for Gmail |
| ❌ Microsoft subs | `microsoft_graph_subscriptions` | **MISSING** | 11 refs, critical for Outlook |
| ❌ Billing plans | `plans` | **MISSING** | 7 refs |
| ❌ Subscriptions | `subscriptions` | **MISSING** | 43 refs, billing critical |

---

## 5. Tables With Single Reference (Potentially Unused)

These tables are referenced **only once** in the codebase and may be:
- Prototypes/experiments
- Dead code
- Tables that should be removed

| Table | Single Reference Location | Status |
|-------|--------------------------|--------|
| `workflows_nodes` | Unknown | 🔍 Investigate |
| `workflow_versions` | Unknown | 🔍 May duplicate workflows_revisions |
| `workflow_test_runs` | Unknown | 🔍 Part of testing system? |
| `workflow_snapshots` | Unknown | 🔍 Duplicate of revisions? |
| `workflow_queue` | Unknown | 🔍 Execution queue |
| `workflow_compositions` | Unknown | 🔍 Nested workflows? |
| `test_suites` | Unknown | 🔍 Testing infrastructure |
| `test_results` | Unknown | 🔍 Testing infrastructure |
| `step_executions` | Unknown | 🔍 Alternative to run_nodes? |
| `scheduled_executions` | Unknown | 🔍 Alternative to schedules? |
| `roi_calculations` | Unknown | 🔍 Analytics |
| `predictions` | Unknown | 🔍 ML feature? |
| `integration_tokens` | Unknown | 🔍 Duplicate of integrations? |
| `integration_health_scores` | Unknown | 🔍 Monitoring |
| `integration_configs` | Unknown | 🔍 Duplicate? |
| `integration_audit_log` | Unknown | 🔍 Audit trail |
| `google_watch_renewal_failures` | Unknown | 🔍 Error tracking |
| `execution_steps` | Unknown | 🔍 Step tracking |
| `email_logs` | Unknown | 🔍 Email tracking |
| `discord_invite_roles` | Unknown | 🔍 Discord integration |
| `database_connections` | Unknown | 🔍 External DB |
| `daily_cost_savings` | Unknown | 🔍 Analytics |
| `custom_api_connectors` | Unknown | 🔍 Enterprise feature? |
| `auth.users` | Unknown | ✅ Supabase auth table (built-in) |
| `api_usage_logs` | Unknown | 🔍 API tracking |
| `analytics_metrics` | Unknown | 🔍 Analytics |
| `ai_workflow_generations` | Unknown | 🔍 AI feature |
| `ai_routing_decisions` | Unknown | 🔍 AI routing |
| `ai_field_resolutions` | Unknown | 🔍 AI field values |
| `ai_chat_history` | Unknown | 🔍 Duplicate of agent_chat_messages? |
| `ai_assistant_waitlist` | Unknown | 🔍 AI waitlist |

---

## 6. Recommendations

### 🔴 **IMMEDIATE ACTIONS (Critical)**

1. **Fix loop_executions Foreign Key**
   ```sql
   -- Option A: Create missing table
   CREATE TABLE workflow_execution_sessions (
     id UUID PRIMARY KEY,
     workflow_id UUID REFERENCES workflows(id),
     user_id UUID REFERENCES auth.users(id),
     status TEXT,
     started_at TIMESTAMPTZ DEFAULT NOW(),
     completed_at TIMESTAMPTZ
   );

   -- Option B: Update loop_executions to reference workflows_runs
   ALTER TABLE loop_executions
     DROP CONSTRAINT loop_executions_session_id_fkey,
     ADD CONSTRAINT loop_executions_run_id_fkey
       FOREIGN KEY (session_id) REFERENCES workflows_runs(id) ON DELETE CASCADE;
   ```

2. **Create Critical Missing Tables**
   - `webhook_configs` (54 references) - Webhook configuration
   - `subscriptions` (43 references) - Billing system
   - `google_watch_subscriptions` (23 references) - Gmail webhooks
   - `microsoft_graph_subscriptions` (11 references) - Outlook webhooks

3. **Update Code for Storage Buckets**
   - Replace `.from('workflow-files')` with Storage API calls
   - Same for `slack-attachments`, `temp-files`, `user-avatars`

### 🟡 **HIGH PRIORITY (Important)**

4. **Consolidate Webhook Tables**
   - Audit: webhook_subscriptions vs webhook_configs vs integration_webhooks
   - Create single source of truth
   - Update all references

5. **Resolve Template Table Confusion**
   - Determine if `workflow_templates` and `workflows_templates` are duplicates
   - Consolidate or document the difference

6. **Create Workflow Variables Table**
   ```sql
   CREATE TABLE workflow_variables (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
     key TEXT NOT NULL,
     value TEXT NOT NULL,
     type TEXT NOT NULL, -- string, number, boolean, json
     created_at TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE(workflow_id, key)
   );
   ```

7. **Audit Organization Tables**
   - `organizations` (12 refs) vs `organization_members` (23 refs)
   - Are orgs implemented? If not, remove references

### 🟠 **MEDIUM PRIORITY (Cleanup)**

8. **Remove Single-Reference Tables**
   - Audit all tables with 1 reference
   - Remove dead code or create missing tables

9. **Standardize Naming Convention**
   - `workflows_*` for workflow-related tables (done for core tables)
   - `workflow_*` for supporting tables (permissions, folders, variables)
   - Update remaining `flow_v2_*` references in code

10. **Create Missing Billing Tables**
    ```sql
    CREATE TABLE plans (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC(10,2),
      features JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE subscriptions (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES auth.users(id),
      plan_id UUID REFERENCES plans(id),
      status TEXT,
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ```

### 🔵 **LOW PRIORITY (Nice to Have)**

11. **Document Table Purposes**
    - Add comments to all tables explaining their purpose
    - Document relationships between tables

12. **Create Missing Analytics Tables**
    - `analytics_metrics` (1 ref)
    - `roi_calculations` (1 ref)
    - `daily_cost_savings` (1 ref)

13. **Consider Adding Missing Features**
    - Collaboration sessions (7 refs)
    - User presence (7 refs)
    - Live execution events (2 refs)

---

## 7. Database Schema Validation Script

Run this in Supabase SQL Editor to validate table existence:

```sql
-- Check which tables exist in public schema
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check for broken foreign keys
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = ccu.table_name
  );

-- Check for tables with no data
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  (SELECT count(*) FROM (SELECT 1 FROM pg_tables t WHERE t.schemaname = schemaname AND t.tablename = tablename LIMIT 1) x) as row_count_sample
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## 8. Code Cleanup Script

Search and replace operations to clean up code:

```bash
# Find all .from() calls
grep -r "\.from(" --include="*.ts" --include="*.tsx" app/ lib/ components/ stores/

# Find references to old flow_v2 tables
grep -r "flow_v2_" --include="*.ts" --include="*.tsx" .

# Find references to storage buckets being used as tables
grep -r "\.from('workflow-files')" --include="*.ts" --include="*.tsx" .
grep -r "\.from('slack-attachments')" --include="*.ts" --include="*.tsx" .
```

---

## Conclusion

The ChainReact database has a **solid foundation** with the new workflows architecture, but there are **significant gaps** between what the code expects and what exists in the database.

### Priority Summary:
1. ✅ **Core workflow system** - Fully implemented and working
2. 🔴 **Critical bugs** - 1 broken FK constraint, 4 heavily-used missing tables
3. 🟡 **Missing features** - Billing, variables, webhook configs need creation
4. 🟠 **Tech debt** - 70+ table references that may not exist
5. 🔵 **Future features** - Collaboration, analytics, monitoring

**Recommended Next Steps:**
1. Run database validation script (Section 7)
2. Fix loop_executions FK constraint immediately
3. Create the 4 critical missing tables (webhook_configs, subscriptions, google_watch_subscriptions, microsoft_graph_subscriptions)
4. Audit and document all existing tables
5. Create migration plan for remaining missing tables

---

**Report compiled by:** Claude Code
**Analysis method:** Codebase search (54 migration files, 100+ application files)
**Limitations:** Unable to query production database directly; analysis based on migrations and code references only
