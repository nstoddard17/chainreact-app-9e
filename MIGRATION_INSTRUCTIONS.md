# Trigger Resources Migration Instructions

## Overview

This migration creates the unified `trigger_resources` table that replaces provider-specific subscription tables. This is the foundation for the trigger lifecycle architecture described in CLAUDE.md.

## Current State

- **Old Architecture**: `microsoft_graph_subscriptions` + `microsoft_webhook_queue` with foreign key
- **New Architecture**: `trigger_resources` table (unified for all providers)
- **Status**: Migration file created, needs to be applied

## Steps to Apply Migration

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/xzwsdwllmrnrgbltibxt/sql/new
2. Copy the contents of `/supabase/migrations/20251003_create_trigger_resources.sql`
3. Paste into the SQL editor
4. Click "Run" to execute the migration
5. Verify the table was created by checking the Tables view

### Option 2: Via Supabase CLI (If you have it set up)

```bash
# Make sure you're authenticated
export SUPABASE_ACCESS_TOKEN="your-token"

# Apply the migration
supabase db push
```

## What This Migration Does

1. **Creates `trigger_resources` table** with columns:
   - `id`, `workflow_id`, `user_id`, `node_id`
   - `provider_id`, `trigger_type`, `resource_type`
   - `external_id` (subscription ID from external system)
   - `config` (JSONB for provider-specific data like clientState)
   - `status`, `expires_at`, `deleted_at`
   - Error tracking fields

2. **Adds indexes** for efficient queries:
   - By workflow, user, provider, external_id, status, expires_at

3. **Sets up RLS policies**:
   - Users can view their own trigger resources
   - Service role has full access

4. **Updates `microsoft_webhook_queue`**:
   - Drops old foreign key to `microsoft_graph_subscriptions`
   - Adds new optional `trigger_resource_id` column
   - Maintains backward compatibility with `subscription_id`

5. **Adds helpful triggers**:
   - Auto-update `updated_at` timestamp

## Code Changes Already Made

✅ **Updated**: `/app/api/webhooks/microsoft/route.ts`
- Now queries `trigger_resources` table first
- Falls back to old `microsoft_graph_subscriptions` for backward compatibility
- Includes `trigger_resource_id` in queue insertions when available

## What Happens After Migration

### Immediate Effects
- ✅ `trigger_resources` table is available for all trigger lifecycle code
- ✅ Microsoft webhook handler works with both old and new architectures
- ✅ No breaking changes (backward compatible)

### Next Steps
1. **Activate a Microsoft Outlook workflow** → Should create rows in `trigger_resources`
2. **Test webhook delivery** → Should resolve subscription from `trigger_resources`
3. **Gradually migrate existing subscriptions** from old table to new table
4. **Other trigger providers** (Gmail, Airtable, Discord) will start using same table

## Testing After Migration

```bash
# 1. Check that table exists
# Via Supabase Dashboard: Tables → trigger_resources

# 2. Activate a workflow with Microsoft Outlook trigger
# Check that a row appears in trigger_resources:
# SELECT * FROM trigger_resources WHERE provider_id = 'microsoft-outlook';

# 3. Send a test email to trigger webhook
# Check logs for: "✅ Resolved from trigger_resources"

# 4. Verify webhook queue insertion works
# SELECT * FROM microsoft_webhook_queue ORDER BY created_at DESC LIMIT 5;
```

## Rollback Plan (If Needed)

If something goes wrong, you can rollback by:

```sql
-- Drop the trigger_resources table
DROP TABLE IF EXISTS trigger_resources CASCADE;

-- Remove the trigger_resource_id column from webhook queue
ALTER TABLE microsoft_webhook_queue DROP COLUMN IF EXISTS trigger_resource_id;

-- Re-add the old foreign key (if needed)
-- ALTER TABLE microsoft_webhook_queue
-- ADD CONSTRAINT microsoft_webhook_queue_subscription_id_fkey
-- FOREIGN KEY (subscription_id) REFERENCES microsoft_graph_subscriptions(id);
```

## Error Messages Explained

### Before Migration
```
❌ Error fetching subscription: {
  code: 'PGRST116',
  details: 'The result contains 0 rows',
  ...
}
❌ Failed to queue notification: {
  code: '23503',
  message: 'insert or update on table "microsoft_webhook_queue" violates foreign key constraint'
}
```

**Cause**: Trying to query `trigger_resources` table that doesn't exist yet, falling back to old table which also has no matching subscription.

### After Migration (Expected)
```
✅ Resolved from trigger_resources: {
  subscriptionId: 'xxx',
  userId: 'xxx',
  workflowId: 'xxx',
  triggerResourceId: 'xxx'
}
✅ Notification queued successfully
```

## Questions?

See:
- `/learning/docs/trigger-lifecycle-audit.md` - Full architecture documentation
- `/CLAUDE.md` - Trigger Lifecycle Pattern section
- `/lib/triggers/TriggerLifecycleManager.ts` - Implementation code
