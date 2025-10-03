# Webhook Queue Auto-Cleanup Migration

**Migration File:** `/supabase/migrations/20251003_webhook_queue_auto_cleanup.sql`
**Date:** January 10, 2025
**Purpose:** Automatically clean up old processed webhook queue items to prevent database bloat

---

## Problem

The `microsoft_webhook_queue` table marks items as `done` or `error` after processing, but never deletes them. This causes:

- **Database bloat** - Table grows indefinitely
- **Performance degradation** - Queries slow down over time
- **Storage costs** - Unnecessary data retention

---

## Solution: Database Trigger with Auto-Cleanup

This migration implements **Option 3 (Database Trigger)** - the best approach for production:

### Architecture

```
Webhook Processing
    ↓
Update status to 'done'/'error'
    ↓
TRIGGER fires
    ↓
Check if cleanup ran in last hour
    ↓
If yes: Skip
If no: Run cleanup_old_webhook_queue_items()
    ↓
Delete items > 7 days old
```

### Components

#### 1. Cleanup Function
```sql
cleanup_old_webhook_queue_items()
```
- Deletes items with status `done` or `error` older than 7 days
- Can be called manually if needed
- Runs automatically via trigger

#### 2. Trigger Function
```sql
trigger_cleanup_webhook_queue()
```
- Fires AFTER UPDATE on `microsoft_webhook_queue`
- Only triggers when status changes to `done` or `error`
- Rate-limited: Runs cleanup at most **once per hour**
- Uses `webhook_queue_cleanup_tracker` table to track last cleanup

#### 3. Cleanup Tracker Table
```sql
webhook_queue_cleanup_tracker
```
- Single-row table (enforced by CHECK constraint)
- Stores `last_cleanup_at` timestamp
- Prevents excessive cleanup operations

#### 4. Performance Index
```sql
idx_webhook_queue_status_created
```
- Partial index on `(status, created_at)`
- Only indexes rows with status `done` or `error`
- Speeds up cleanup DELETE queries

---

## Configuration

### Retention Period
**Default:** 7 days

To change retention period, modify line 13 in the migration:
```sql
AND created_at < NOW() - INTERVAL '7 days';  -- Change '7 days' to desired value
```

### Cleanup Frequency
**Default:** Once per hour (at most)

To change cleanup frequency, modify line 26:
```sql
cleanup_interval INTERVAL := '1 hour';  -- Change to desired interval
```

---

## Applying the Migration

### Method 1: Supabase CLI (Recommended)
```bash
# Navigate to project directory
cd c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e

# Push migration to remote database
supabase db push
```

### Method 2: Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor**
4. Copy contents of migration file
5. Execute the SQL

### Method 3: Direct Database Connection
```bash
# Connect to database
psql [your-connection-string]

# Run migration
\i supabase/migrations/20251003_webhook_queue_auto_cleanup.sql
```

---

## Testing the Migration

### 1. Verify Functions Were Created
```sql
-- Check if functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%webhook_queue%';
```

Expected output:
- `cleanup_old_webhook_queue_items` (FUNCTION)
- `trigger_cleanup_webhook_queue` (FUNCTION)

### 2. Verify Trigger Was Created
```sql
-- Check if trigger exists
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'webhook_queue_cleanup_trigger';
```

Expected output:
- `webhook_queue_cleanup_trigger` on `microsoft_webhook_queue` table

### 3. Verify Index Was Created
```sql
-- Check if index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'microsoft_webhook_queue'
  AND indexname = 'idx_webhook_queue_status_created';
```

### 4. Test Manual Cleanup
```sql
-- Run cleanup manually
SELECT cleanup_old_webhook_queue_items();

-- Check how many items were deleted (check logs)
```

### 5. Test Automatic Trigger
```sql
-- Insert a test item
INSERT INTO microsoft_webhook_queue (resource, change_type, subscription_id, user_id, status)
VALUES ('test-resource', 'created', 'test-sub-id', 'test-user-id', 'pending');

-- Update to 'done' (should trigger cleanup)
UPDATE microsoft_webhook_queue
SET status = 'done'
WHERE resource = 'test-resource';

-- Check tracker was updated
SELECT * FROM webhook_queue_cleanup_tracker;

-- Clean up test data
DELETE FROM microsoft_webhook_queue WHERE resource = 'test-resource';
```

---

## Monitoring

### Check Queue Size
```sql
-- Total items in queue
SELECT COUNT(*) AS total_items
FROM microsoft_webhook_queue;

-- Breakdown by status
SELECT status, COUNT(*) AS count
FROM microsoft_webhook_queue
GROUP BY status
ORDER BY count DESC;

-- Items eligible for cleanup
SELECT COUNT(*) AS cleanup_eligible
FROM microsoft_webhook_queue
WHERE status IN ('done', 'error')
  AND created_at < NOW() - INTERVAL '7 days';
```

### Check Last Cleanup Time
```sql
SELECT last_cleanup_at,
       NOW() - last_cleanup_at AS time_since_cleanup
FROM webhook_queue_cleanup_tracker;
```

### View Cleanup History (from logs)
Cleanup operations log a NOTICE message:
```
NOTICE: Cleaned up old webhook queue items older than 7 days
```

Check Supabase logs or Postgres logs for these messages.

---

## Performance Impact

### Positive Impacts
✅ **Automatic cleanup** - No manual intervention needed
✅ **Rate-limited** - Runs at most once per hour (minimal overhead)
✅ **Indexed deletes** - Fast cleanup queries
✅ **Small table** - Better query performance overall

### Overhead
⚠️ **Minimal** - Trigger checks on every status update
⚠️ **Negligible** - Cleanup runs once per hour at most
⚠️ **Lock duration** - DELETE operation may briefly lock table (should be milliseconds)

---

## Troubleshooting

### Issue: Cleanup Not Running

**Check 1: Is trigger enabled?**
```sql
SELECT tgenabled FROM pg_trigger
WHERE tgname = 'webhook_queue_cleanup_trigger';
```
Result should be `O` (enabled).

**Check 2: When was last cleanup?**
```sql
SELECT last_cleanup_at FROM webhook_queue_cleanup_tracker;
```
If more than 1 hour ago and items exist, trigger may not be firing.

**Check 3: Are there items to clean?**
```sql
SELECT COUNT(*) FROM microsoft_webhook_queue
WHERE status IN ('done', 'error')
  AND created_at < NOW() - INTERVAL '7 days';
```

**Solution: Run manual cleanup**
```sql
SELECT cleanup_old_webhook_queue_items();
```

### Issue: Too Many Items Being Deleted

**Increase retention period** in the cleanup function (line 13):
```sql
AND created_at < NOW() - INTERVAL '30 days';  -- Keep for 30 days instead
```

### Issue: Performance Degradation

**Check index usage:**
```sql
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname = 'idx_webhook_queue_status_created';
```

**Consider reducing cleanup frequency** if it's running too often.

---

## Rollback Procedure

If you need to remove the auto-cleanup:

```sql
-- Drop trigger
DROP TRIGGER IF EXISTS webhook_queue_cleanup_trigger ON microsoft_webhook_queue;

-- Drop functions
DROP FUNCTION IF EXISTS trigger_cleanup_webhook_queue();
DROP FUNCTION IF EXISTS cleanup_old_webhook_queue_items();

-- Drop tracker table
DROP TABLE IF EXISTS webhook_queue_cleanup_tracker;

-- Drop index
DROP INDEX IF EXISTS idx_webhook_queue_status_created;
```

---

## Future Improvements

### Optional Enhancements

1. **Configurable retention per status**
   - Keep `done` items for 7 days
   - Keep `error` items for 30 days (for debugging)

2. **Archive instead of delete**
   - Move old items to `microsoft_webhook_queue_archive` table
   - Useful for long-term analytics

3. **Metrics tracking**
   - Track number of items deleted
   - Store in a `cleanup_metrics` table

4. **Adaptive cleanup frequency**
   - Run more frequently when queue is large
   - Less frequently when queue is small

---

## Related Documentation

- [Supabase Database Management (CLAUDE.md)](/CLAUDE.md#supabase-database-management)
- [Advanced Execution Engine Refactoring](/learning/walkthroughs/advanced-execution-engine-refactoring.md)

---

## Summary

**What It Does:**
- ✅ Automatically deletes processed webhook queue items older than 7 days
- ✅ Runs at most once per hour (rate-limited)
- ✅ Zero maintenance required after deployment

**Impact:**
- ✅ Prevents database bloat
- ✅ Maintains query performance
- ✅ Reduces storage costs

**Deployment:**
```bash
supabase db push
```

That's it! The queue will now clean itself automatically. 🎉
