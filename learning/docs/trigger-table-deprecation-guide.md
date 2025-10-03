# Trigger Table Deprecation Guide

**Date**: October 3, 2025
**Status**: Ready for execution
**Impact**: Low (data will be preserved through migration)

## Summary

As part of the Trigger Lifecycle refactoring, we're consolidating all trigger resource tracking into a single `trigger_resources` table. This deprecates 3 old tables that had overlapping functionality.

## Tables Being Deprecated

### 1. `google_watch_subscriptions` ❌
**Created**: September 24, 2024
**Reason for deprecation**:
- No `workflow_id` tracking (can't determine which workflow owns subscription)
- Duplicates functionality now in `trigger_resources`
- Missing integration with new lifecycle management system

**Data preservation**: ✅ All data will be migrated to `trigger_resources`

### 2. `google_watch_renewal_failures` ❌
**Created**: September 24, 2024
**Reason for deprecation**:
- Health tracking now handled by `trigger_resources.health_status` (JSONB)
- With new lifecycle pattern, subscriptions are recreated on activation (not renewed)
- Table had minimal usage

**Data preservation**: ⚠️ No migration needed (historical data, not critical)

### 3. `airtable_webhooks` ❌
**Created**: January 23, 2025
**Reason for deprecation**:
- No `workflow_id` tracking (can't determine which workflow owns webhook)
- Duplicates functionality now in `trigger_resources`
- Missing integration with new lifecycle management system

**Data preservation**: ✅ All data will be migrated to `trigger_resources`

### 4. `microsoft_graph_subscriptions` ⚠️ (Partial)
**Status**: **Still in use but updated**
- ✅ Added `workflow_id` column in migration 20251003
- ⚠️ Currently populated alongside `trigger_resources` for backward compatibility
- 🔮 Future: Will be fully replaced by `trigger_resources` once all code is migrated

## Migration Timeline

### Phase 1: Migration (Immediate) ✅
**File**: `20251003_migrate_old_tables_to_trigger_resources.sql`

**What it does**:
1. Migrates all records from `google_watch_subscriptions` → `trigger_resources`
2. Migrates all records from `airtable_webhooks` → `trigger_resources`
3. Marks old tables as DEPRECATED with comments
4. Preserves all original data in `config` JSONB field

**Safety**:
- ✅ Safe to run multiple times (checks for existing records)
- ✅ Does NOT drop any tables
- ✅ Original tables remain intact
- ✅ Includes verification queries

**Run with**:
```bash
supabase db push
```

### Phase 2: Verification (1-7 days) 🔍
**Before dropping tables, verify**:

1. **Check migration succeeded**:
```sql
-- Should show migrated Google subscriptions
SELECT count(*) as total, provider_id, status
FROM trigger_resources
WHERE config->>'migrated_from' = 'google_watch_subscriptions'
GROUP BY provider_id, status;

-- Should show migrated Airtable webhooks
SELECT count(*) as total, status
FROM trigger_resources
WHERE config->>'migrated_from' = 'airtable_webhooks'
GROUP BY status;
```

2. **Check for orphaned resources** (no workflow_id):
```sql
-- These are migrated from old tables (no workflow tracking)
SELECT
  id,
  user_id,
  provider_id,
  external_id,
  config->>'migrated_from' as source
FROM trigger_resources
WHERE workflow_id IS NULL
AND config->>'migrated_from' IS NOT NULL;
```

3. **Verify new workflows use trigger_resources**:
```sql
-- Should show new entries with workflow_id
SELECT count(*) as new_triggers
FROM trigger_resources
WHERE workflow_id IS NOT NULL
AND created_at > '2025-10-03';
```

4. **Confirm no code references old tables**:
```bash
# Search codebase for references to old tables
grep -r "google_watch_subscriptions" --include="*.ts" --include="*.tsx"
grep -r "airtable_webhooks" --include="*.ts" --include="*.tsx"
```

### Phase 3: Cleanup (After verification) 🗑️
**File**: `20251003_drop_obsolete_trigger_tables.sql`

**What it does**:
1. Drops `google_watch_renewal_failures` table
2. Drops `google_watch_subscriptions` table
3. Drops `airtable_webhooks` table
4. Updates comments on remaining tables

**Safety**:
- ✅ Safe to run multiple times (checks if tables exist)
- ⚠️ **CANNOT BE UNDONE** - tables and data will be permanently deleted
- ⚠️ Only run AFTER verifying migration succeeded

**Run with**:
```bash
supabase db push
```

## What About Orphaned Resources?

**Q**: What happens to migrated resources with `workflow_id = NULL`?

**A**: These are subscriptions/webhooks that were created under the old system (before workflow tracking). They have 3 possible fates:

1. **Active workflows**: If user still has active workflows with these triggers, they'll be recreated with proper `workflow_id` when workflow is next activated/deactivated
2. **Inactive**: If no workflows use them, they'll eventually be cleaned up by health checks
3. **Manual cleanup**: Admin can manually associate them with workflows or delete them

**Recommended action**:
```sql
-- After 30 days, clean up orphaned migrated resources
DELETE FROM trigger_resources
WHERE workflow_id IS NULL
AND config->>'migrated_from' IS NOT NULL
AND created_at < NOW() - INTERVAL '30 days';
```

## Benefits of Consolidation

### Before (3+ tables)
- ❌ `google_watch_subscriptions` - Google only
- ❌ `airtable_webhooks` - Airtable only
- ❌ `microsoft_graph_subscriptions` - Microsoft only
- ❌ No workflow tracking
- ❌ No unified lifecycle management
- ❌ Hard to audit all resources

### After (1 table)
- ✅ `trigger_resources` - ALL providers
- ✅ Tracks `workflow_id` (ownership)
- ✅ Unified lifecycle management via `TriggerLifecycleManager`
- ✅ Health status tracking
- ✅ Expiration tracking
- ✅ Easy audit: `SELECT * FROM trigger_resources WHERE user_id = 'xxx'`

## Rollback Plan

If issues are discovered after dropping tables:

1. **Stop**: Don't run the drop migration yet
2. **Investigate**: Check what's still using old tables
3. **Fix code**: Update code to use `trigger_resources`
4. **Wait**: Give more time for verification

**Note**: Once tables are dropped (Phase 3), rollback is NOT possible. The migration to `trigger_resources` preserves data, but dropping tables is permanent.

## Post-Migration Monitoring

After completing all phases, monitor:

1. **New triggers created**:
```sql
-- Should all have workflow_id
SELECT count(*) as triggers_without_workflow
FROM trigger_resources
WHERE workflow_id IS NULL
AND created_at > NOW() - INTERVAL '7 days';
-- Should return 0
```

2. **Failed activations** (check logs):
```bash
# Look for errors mentioning old tables
grep "google_watch_subscriptions\|airtable_webhooks" logs/
```

3. **Database size** (should decrease):
```sql
-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE '%trigger%' OR tablename LIKE '%watch%' OR tablename LIKE '%webhook%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Questions & Answers

**Q: Will this break existing workflows?**
A: No. The migration preserves all data and the new system is backward compatible.

**Q: What if I find a bug after dropping tables?**
A: The migrated data is preserved in `trigger_resources.config` with the original IDs. We can reconstruct if absolutely necessary, but it's better to verify thoroughly before dropping.

**Q: How long should I wait before dropping tables?**
A: Recommended: 7-30 days of monitoring in production.

**Q: Can I skip the migration and just drop the tables?**
A: **NO!** You'll lose data about active subscriptions and webhooks. Always migrate first.

## Checklist

Before running migrations:

- [ ] Backup database
- [ ] Review migration SQL files
- [ ] Understand what will be migrated
- [ ] Plan verification period (7-30 days recommended)

After running migration (Phase 1):

- [ ] Run verification queries
- [ ] Check for orphaned resources
- [ ] Monitor logs for errors
- [ ] Verify new workflows use trigger_resources
- [ ] Search code for references to old tables

Before dropping tables (Phase 3):

- [ ] Confirm all verifications passed
- [ ] Confirm no code references old tables
- [ ] Take final backup
- [ ] Get team approval
- [ ] Document the action

After dropping tables:

- [ ] Monitor for errors
- [ ] Check database size reduction
- [ ] Update documentation
- [ ] Celebrate cleanup! 🎉

## Related Documentation

- [Trigger Lifecycle Architecture](trigger-lifecycle-audit.md)
- [Trigger Lifecycle Refactoring](../walkthroughs/trigger-lifecycle-refactoring.md)
- [Action/Trigger Implementation Guide](action-trigger-implementation-guide.md)
