# Database Cleanup Checklist

**Priority:** 🔴 Critical | 🟡 High | 🟠 Medium | 🟢 Low
**Status:** ⬜ Not Started | 🟦 In Progress | ✅ Complete | ⏭️ Skipped

---

## 🔴 CRITICAL - Fix Immediately

### 1. ⬜ Fix loop_executions Foreign Key
**Issue:** References non-existent `workflow_execution_sessions` table

**Choose ONE option:**

- [ ] **Option A:** Create the missing table
  ```sql
  CREATE TABLE workflow_execution_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
  );
  ```

- [ ] **Option B:** Update loop_executions to reference workflows_runs
  ```sql
  ALTER TABLE loop_executions
    DROP CONSTRAINT loop_executions_session_id_fkey,
    RENAME COLUMN session_id TO run_id,
    ADD CONSTRAINT loop_executions_run_id_fkey
      FOREIGN KEY (run_id) REFERENCES workflows_runs(id) ON DELETE CASCADE;
  ```

**Files to update if choosing Option B:**
- `lib/workflows/actions/logic/loop.ts`
- Any file querying `loop_executions.session_id`

---

### 2. ⬜ Create webhook_configs Table
**Refs:** 54 | **Priority:** 🔴 CRITICAL

**Migration:**
```sql
CREATE TABLE webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT[] DEFAULT '{}',
  headers JSONB DEFAULT '{}',
  method TEXT DEFAULT 'POST',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'failed')),
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_configs_user_id ON webhook_configs(user_id);
CREATE INDEX idx_webhook_configs_status ON webhook_configs(status);

ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own webhook configs"
  ON webhook_configs FOR ALL
  USING (auth.uid() = user_id);
```

**Files using this table:**
- `app/api/custom-webhooks/[webhookId]/executions/route.ts`
- `app/api/custom-webhooks/[webhookId]/route.ts`

---

### 3. ⬜ Create Billing Tables
**Refs:** 43 (subscriptions) + 7 (plans) | **Priority:** 🔴 CRITICAL

**Migration:**
```sql
-- Plans table
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC(10,2),
  price_yearly NUMERIC(10,2),
  features JSONB DEFAULT '{}',
  limits JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_team_id ON subscriptions(team_id);
CREATE INDEX idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Plans are public (everyone can see them)
CREATE POLICY "Plans are publicly readable"
  ON plans FOR SELECT
  USING (is_active = true);

-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id OR team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));
```

**Files using these tables:**
- `stores/billingStore.ts`
- Billing API routes

---

### 4. ⬜ Create Gmail Webhook Subscriptions Table
**Refs:** 23 | **Priority:** 🔴 CRITICAL

**Migration:**
```sql
CREATE TABLE google_watch_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  history_id TEXT,
  expiration TIMESTAMPTZ NOT NULL,
  resource_type TEXT NOT NULL, -- 'gmail', 'drive', etc.
  resource_id TEXT, -- For Drive: file ID
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'failed')),
  last_notification_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, resource_type)
);

CREATE INDEX idx_google_watch_workflow_id ON google_watch_subscriptions(workflow_id);
CREATE INDEX idx_google_watch_user_id ON google_watch_subscriptions(user_id);
CREATE INDEX idx_google_watch_expiration ON google_watch_subscriptions(expiration);
CREATE INDEX idx_google_watch_status ON google_watch_subscriptions(status);

ALTER TABLE google_watch_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own google watch subscriptions"
  ON google_watch_subscriptions FOR ALL
  USING (auth.uid() = user_id);
```

**Files using this table:**
- Gmail/Google Drive trigger handlers
- `lib/triggers/providers/GoogleApisTriggerLifecycle.ts`

---

### 5. ⬜ Create Microsoft Graph Subscriptions Table
**Refs:** 11 | **Priority:** 🔴 CRITICAL

**Migration:**
```sql
CREATE TABLE microsoft_graph_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL UNIQUE, -- Microsoft's subscription ID
  resource TEXT NOT NULL, -- e.g., "me/mailFolders('Inbox')/messages"
  change_type TEXT NOT NULL, -- created, updated, deleted
  expiration_datetime TIMESTAMPTZ NOT NULL,
  client_state TEXT,
  notification_url TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'failed', 'renewing')),
  last_notification_at TIMESTAMPTZ,
  renewal_attempts INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, resource)
);

CREATE INDEX idx_microsoft_graph_workflow_id ON microsoft_graph_subscriptions(workflow_id);
CREATE INDEX idx_microsoft_graph_user_id ON microsoft_graph_subscriptions(user_id);
CREATE INDEX idx_microsoft_graph_subscription_id ON microsoft_graph_subscriptions(subscription_id);
CREATE INDEX idx_microsoft_graph_expiration ON microsoft_graph_subscriptions(expiration_datetime);
CREATE INDEX idx_microsoft_graph_status ON microsoft_graph_subscriptions(status);

ALTER TABLE microsoft_graph_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own microsoft graph subscriptions"
  ON microsoft_graph_subscriptions FOR ALL
  USING (auth.uid() = user_id);
```

**Files using this table:**
- `lib/microsoft-graph/subscriptionManager.ts`
- `lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts`
- `app/api/microsoft-graph/` routes

---

## 🟡 HIGH PRIORITY - Fix Soon

### 6. ⬜ Audit Webhook Infrastructure
**Issue:** Multiple overlapping webhook tables

**Tables to audit:**
- `webhook_subscriptions` (baseline schema) - 0 refs
- `webhook_configs` (54 refs, not created)
- `integration_webhooks` (15 refs)
- `trigger_resources` (100 refs)

**Action Items:**
- [ ] Document purpose of each table
- [ ] Identify source of truth
- [ ] Create migration to consolidate or clarify relationships
- [ ] Update documentation

---

### 7. ⬜ Resolve Template Table Confusion
**Issue:** Two template tables with unclear relationship

**Tables:**
- `workflows_templates` (created in flow_v2_parity.sql, 4 refs)
- `workflow_templates` (9 refs, not created)

**Action Items:**
- [ ] Determine if these are duplicates
- [ ] If duplicates: Rename workflow_templates → workflows_templates in code
- [ ] If different: Document the distinction
- [ ] Create missing table if needed

---

### 8. ⬜ Create workflow_variables Table
**Refs:** 7 | **Priority:** 🟡 HIGH

**Migration:**
```sql
CREATE TABLE workflow_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('string', 'number', 'boolean', 'json', 'secret')),
  description TEXT,
  is_encrypted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, key)
);

CREATE INDEX idx_workflow_variables_workflow_id ON workflow_variables(workflow_id);

ALTER TABLE workflow_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage variables for their workflows"
  ON workflow_variables FOR ALL
  USING (
    workflow_id IN (
      SELECT id FROM workflows WHERE owner_id = auth.uid()
    )
  );
```

**Files using this table:**
- `stores/workflowVariableStore.ts`

---

### 9. ⬜ Create Airtable Webhooks Table
**Refs:** 17 | **Priority:** 🟡 HIGH

**Migration:**
```sql
CREATE TABLE airtable_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  webhook_id TEXT NOT NULL UNIQUE, -- Airtable's webhook ID
  base_id TEXT NOT NULL,
  specification JSONB NOT NULL, -- Airtable webhook specification
  mac_secret TEXT NOT NULL,
  expiration_time TIMESTAMPTZ,
  cursor INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'failed')),
  last_notification_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, base_id)
);

CREATE INDEX idx_airtable_webhooks_workflow_id ON airtable_webhooks(workflow_id);
CREATE INDEX idx_airtable_webhooks_webhook_id ON airtable_webhooks(webhook_id);
CREATE INDEX idx_airtable_webhooks_status ON airtable_webhooks(status);

ALTER TABLE airtable_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own airtable webhooks"
  ON airtable_webhooks FOR ALL
  USING (auth.uid() = user_id);
```

**Files using this table:**
- `lib/triggers/providers/AirtableTriggerLifecycle.ts`

---

## 🟠 MEDIUM PRIORITY - Technical Debt

### 10. ⬜ Fix Storage Bucket References
**Issue:** Code treats storage buckets as database tables

**Buckets incorrectly referenced as tables:**
- `workflow-files` (28 refs)
- `slack-attachments` (4 refs)
- `temp-files` (6 refs)
- `user-avatars` (3 refs)

**Action Items:**
- [ ] Replace `.from('workflow-files')` with `storage.from('workflow-files')`
- [ ] Update file upload/download logic
- [ ] Test file operations

**Example fix:**
```typescript
// ❌ WRONG
const { data } = await supabase.from('workflow-files').select('*')

// ✅ CORRECT
const { data } = await supabase.storage.from('workflow-files').list()
```

---

### 11. ⬜ Create AI Cost Tracking Tables
**Refs:** 17 (ai_cost_logs) + 5 (ai_user_budgets)

**Migration:**
```sql
CREATE TABLE ai_cost_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  run_id UUID REFERENCES workflows_runs(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  cost NUMERIC(10,6) NOT NULL,
  provider TEXT NOT NULL, -- openai, anthropic, etc.
  operation TEXT NOT NULL, -- workflow_generation, node_execution, etc.
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_user_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_limit NUMERIC(10,2) NOT NULL DEFAULT 10.00,
  current_usage NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  period_start TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('month', NOW()),
  period_end TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('month', NOW()) + INTERVAL '1 month',
  alert_threshold NUMERIC(3,2) DEFAULT 0.80, -- Alert at 80%
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_cost_logs_user_id ON ai_cost_logs(user_id);
CREATE INDEX idx_ai_cost_logs_created_at ON ai_cost_logs(created_at DESC);
CREATE INDEX idx_ai_user_budgets_user_id ON ai_user_budgets(user_id);

ALTER TABLE ai_cost_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_user_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI cost logs"
  ON ai_cost_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own AI budgets"
  ON ai_user_budgets FOR SELECT
  USING (auth.uid() = user_id);
```

---

### 12. ⬜ Audit and Remove Single-Reference Tables
**Issue:** 37+ tables with only 1 reference (may be dead code)

**High-priority candidates for removal:**
- `workflow_snapshots` - May duplicate workflows_revisions
- `workflow_queue` - May duplicate workflows_runs
- `workflow_versions` - May duplicate workflows_revisions
- `integration_tokens` - May duplicate integrations
- `scheduled_executions` - May duplicate workflows_schedules

**Action Items:**
- [ ] For each single-ref table, determine:
  - Is it prototype code?
  - Is it actually used?
  - Can it be removed?
- [ ] Remove references from code
- [ ] Document decision

---

### 13. ⬜ Create Organizations Table (if needed)
**Refs:** 12

**Migration:**
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id),
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_owner_id ON organizations(owner_id);
CREATE INDEX idx_organizations_slug ON organizations(slug);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view organizations they belong to"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
    OR owner_id = auth.uid()
  );
```

**Note:** `organization_members` table already exists

---

## 🟢 LOW PRIORITY - Future Enhancements

### 14. ⬜ Create Collaboration Tables
- `collaboration_sessions` (7 refs)
- `user_presence` (7 refs)
- `live_execution_events` (2 refs)

### 15. ⬜ Create Analytics Tables
- `analytics_metrics` (1 ref)
- `roi_calculations` (1 ref)
- `daily_cost_savings` (1 ref)

### 16. ⬜ Create Support Tables
- `support_tickets` (8 refs)
- `support_ticket_responses` (2 refs)

### 17. ⬜ Create Enterprise Tables
- `enterprise_integrations` (3 refs)
- `sso_configurations` (3 refs)
- `custom_api_connectors` (1 ref)

---

## Validation & Testing

### ⬜ Post-Migration Validation

After each table creation, run:

```sql
-- Verify table exists
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'YOUR_TABLE_NAME';

-- Check foreign keys are valid
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'YOUR_TABLE_NAME';

-- Test RLS policies
SET ROLE authenticated;
SELECT * FROM YOUR_TABLE_NAME LIMIT 1;
```

### ⬜ Code Validation

For each fixed table:
- [ ] Search for all references: `grep -r "\.from('TABLE_NAME')" .`
- [ ] Update TypeScript types if needed
- [ ] Test CRUD operations
- [ ] Verify RLS policies work correctly
- [ ] Update documentation

---

## Notes

- **Always create migrations** - Never alter tables directly in production
- **Test locally first** - Use `supabase db reset` and test migrations
- **Backup before big changes** - Run `supabase db dump`
- **Update CLAUDE.md** - Document any new tables or patterns
- **One migration per table** - Keep migrations focused and reversible

---

**Last Updated:** 2025-11-20
**Next Review:** After completing critical items (1-5)
