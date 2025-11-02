# Team Lifecycle Management - Deployment Guide

## Overview

This deployment implements comprehensive team lifecycle management:
- ✅ Automatic team folder creation (root + trash)
- ✅ Grace period enforcement (5 days after downgrade)
- ✅ Pre-cancellation warnings (7 days before expiration)
- ✅ Workflow migration on team deletion
- ✅ Team suspension system
- ✅ Progressive warning banners

## Architecture Decision: Team as Virtual User

**Problem**: How to handle team folders without complex nullable columns and RLS policies?

**Solution**: Treat teams as virtual users by setting `user_id = team_id` for team folders.

**Benefits**:
- ✅ Simple schema (user_id remains NOT NULL)
- ✅ Existing constraints work without modification
- ✅ Each team gets unique folder space
- ✅ No complex RLS policies needed
- ✅ Clear separation: personal folders (team_id = NULL) vs team folders (team_id = team_id)

**Structure**:
```
workflow_folders
├─ user_id = 'alice', team_id = NULL      ← Alice's personal folder
├─ user_id = 'team-1', team_id = 'team-1' ← Team 1's folder
└─ user_id = 'team-2', team_id = 'team-2' ← Team 2's folder
```

**Access Control**:
- Personal folders: Check `user_id = auth.uid() AND team_id IS NULL`
- Team folders: Check `team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())`

---

## Migration Files (Run in Order)

### Migration 1: Schema Updates
**File**: `supabase/migrations/20251103000001_add_team_lifecycle_columns.sql`

**What it does**:
1. Adds `is_trash` and `team_id` columns to `workflow_folders`
2. Adds suspension tracking columns to `teams` table
3. Creates constraints:
   - One default folder per user_id (works for both users and teams)
   - One trash folder per team
   - Enforces `user_id = team_id` for team folders
4. Updates RLS policies for team folder access

**Key Constraints**:
```sql
-- One default folder per user_id
CREATE UNIQUE INDEX idx_workflow_folders_user_default
  ON workflow_folders(user_id)
  WHERE is_default = TRUE;

-- Ensure team folders have user_id = team_id
ALTER TABLE workflow_folders
ADD CONSTRAINT team_folders_user_id_matches_team_id
  CHECK ((team_id IS NULL) OR (user_id::text = team_id::text));
```

### Migration 2: Team Folder Initialization
**File**: `supabase/migrations/20251103000002_create_team_folder_initialization.sql`

**What it does**:
1. Creates `initialize_team_folders()` trigger function
2. Sets up trigger to run on team creation
3. **Backfills existing teams** with folders

**Critical Code**:
```sql
-- Create team folders with user_id = team_id
INSERT INTO workflow_folders (
  name, team_id, user_id, is_default, ...
) VALUES (
  NEW.name || '''s Workflows',
  NEW.id,
  NEW.id::text::uuid, -- ← Treat team as virtual user
  TRUE,
  ...
);
```

### Migration 3: Workflow Migration
**File**: `supabase/migrations/20251103000003_create_workflow_migration_function.sql`

**What it does**:
1. Creates trigger to migrate workflows when team is deleted
2. Moves workflows to creator's root folder (doesn't delete them)
3. Logs migration for audit trail

### Migration 4: Suspension Notifications
**File**: `supabase/migrations/20251103000004_create_suspension_notifications_table.sql`

**What it does**:
1. Creates `team_suspension_notifications` table
2. Tracks all notifications sent to team owners
3. Auto-creates notifications when grace period starts

---

## Deployment Steps

### 1. Run Migrations in Supabase Studio

**Go to**: Supabase Dashboard → SQL Editor

**Run each migration in order** (copy/paste entire file):

```sql
-- 1. Schema updates (team_id column, constraints, RLS)
[Paste contents of 20251103000001_add_team_lifecycle_columns.sql]

-- 2. Team folder initialization (trigger + backfill)
[Paste contents of 20251103000002_create_team_folder_initialization.sql]

-- 3. Workflow migration on team deletion
[Paste contents of 20251103000003_create_workflow_migration_function.sql]

-- 4. Suspension notifications tracking
[Paste contents of 20251103000004_create_suspension_notifications_table.sql]
```

**After each migration**:
- Check for errors in the output
- Verify success message

### 2. Verify Migrations

**Run this query to check team folders were created**:
```sql
SELECT
  id,
  name,
  user_id,
  team_id,
  is_default,
  is_trash
FROM workflow_folders
WHERE team_id IS NOT NULL
ORDER BY team_id, is_default DESC;

-- Expected: Each team has 2 folders
-- 1. Default folder: user_id = team_id, is_default = TRUE
-- 2. Trash folder: user_id = team_id, is_trash = TRUE
```

**Check constraints are correct**:
```sql
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'workflow_folders'
  AND indexname IN (
    'idx_workflow_folders_user_default',
    'unique_trash_folder_per_team'
  )
ORDER BY indexname;

-- Expected: 2 indexes with WHERE clauses
```

### 3. Deploy Code to Vercel

**Files already updated**:
- ✅ `app/api/webhooks/stripe-billing/route.ts` - Handles subscription cancellation
- ✅ `app/api/workflows/execute/route.ts` - Blocks suspended teams
- ✅ `app/api/cron/check-team-suspensions/route.ts` - Cron job for enforcement
- ✅ `components/billing/SubscriptionExpirationBanner.tsx` - Pre-cancellation warning
- ✅ `components/teams/TeamSuspensionBanner.tsx` - Grace period warning
- ✅ `components/dashboard/BillingWarningBanners.tsx` - Unified warnings
- ✅ `vercel.json` - Cron job configuration

**Deploy**:
```bash
git add .
git commit -m "Add team lifecycle management with grace periods and warnings"
git push origin main
```

### 4. Set Environment Variable

**In Vercel Dashboard**:
1. Go to Project Settings → Environment Variables
2. Add:
   - Key: `CRON_SECRET`
   - Value: Generate a random secret (e.g., `openssl rand -base64 32`)
   - Environment: Production, Preview, Development

**Redeploy** after adding the environment variable.

### 5. Test Cron Job

**Manual trigger** (replace with your actual secret):
```bash
curl -X POST https://chainreact.app/api/cron/check-team-suspensions \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Expected response**:
```json
{
  "success": true,
  "teamsChecked": N,
  "teamsSuspended": M,
  "notificationsSent": P
}
```

---

## Testing Checklist

### Test 1: New Team Creation
1. Create a new team
2. Check database: Team should have 2 folders (default + trash)
3. Verify `user_id = team_id` for both folders

### Test 2: Grace Period Flow
1. As Pro user with teams, downgrade to Free
2. Check database: `grace_period_ends_at` should be 5 days from now
3. Banner should show on dashboard with days remaining
4. Wait for cron or manually trigger
5. After grace period expires, team should be suspended

### Test 3: Pre-Cancellation Warning
1. As Pro user, check subscription end date
2. If within 7 days of expiration, banner should show
3. Banner urgency should increase closer to expiration:
   - 7-5 days: Yellow
   - 4-2 days: Orange
   - 0-1 days: Red with pulse

### Test 4: Workflow Execution Block
1. Suspend a team (set `suspended_at` in database)
2. Try to execute a workflow from that team
3. Should return 403 error with suspension reason

### Test 5: Team Deletion
1. Delete a team with workflows
2. Check workflows migrated to creator's root folder
3. Verify team folders deleted (cascade)

---

## Key SQL Queries for Monitoring

**Teams in grace period**:
```sql
SELECT
  t.id,
  t.name,
  t.grace_period_ends_at,
  EXTRACT(DAY FROM (t.grace_period_ends_at - NOW())) as days_remaining,
  t.suspension_reason
FROM teams t
WHERE t.suspended_at IS NULL
  AND t.grace_period_ends_at IS NOT NULL
  AND t.grace_period_ends_at > NOW()
ORDER BY t.grace_period_ends_at;
```

**Suspended teams**:
```sql
SELECT
  t.id,
  t.name,
  t.suspended_at,
  t.suspension_reason,
  COUNT(w.id) as workflow_count
FROM teams t
LEFT JOIN workflows w ON w.team_id = t.id
WHERE t.suspended_at IS NOT NULL
GROUP BY t.id, t.name, t.suspended_at, t.suspension_reason
ORDER BY t.suspended_at DESC;
```

**Subscription expiration warnings**:
```sql
SELECT
  up.id,
  up.email,
  up.stripe_subscription_end_date,
  EXTRACT(DAY FROM (up.stripe_subscription_end_date - NOW())) as days_until_expiration,
  COUNT(DISTINCT t.id) as team_count
FROM user_profiles up
LEFT JOIN teams t ON t.created_by = up.id AND t.suspended_at IS NULL
WHERE up.stripe_subscription_end_date IS NOT NULL
  AND up.stripe_subscription_end_date > NOW()
  AND up.stripe_subscription_end_date <= NOW() + INTERVAL '7 days'
GROUP BY up.id, up.email, up.stripe_subscription_end_date
ORDER BY up.stripe_subscription_end_date;
```

---

## Rollback Plan

If something goes wrong:

### Rollback Migration 2 (Team Folder Initialization)
```sql
-- Drop trigger
DROP TRIGGER IF EXISTS initialize_team_folders_trigger ON public.teams;
DROP FUNCTION IF EXISTS initialize_team_folders();

-- Manually delete team folders if needed
DELETE FROM workflow_folders WHERE team_id IS NOT NULL;
```

### Rollback Migration 1 (Schema Changes)
```sql
-- Drop new constraints
DROP INDEX IF EXISTS idx_workflow_folders_user_default;
DROP INDEX IF EXISTS unique_trash_folder_per_team;
ALTER TABLE workflow_folders DROP CONSTRAINT IF EXISTS team_folders_user_id_matches_team_id;

-- Remove columns
ALTER TABLE workflow_folders DROP COLUMN IF EXISTS is_trash;
ALTER TABLE workflow_folders DROP COLUMN IF EXISTS team_id;
ALTER TABLE teams DROP COLUMN IF EXISTS suspended_at;
ALTER TABLE teams DROP COLUMN IF EXISTS suspension_reason;
ALTER TABLE teams DROP COLUMN IF EXISTS grace_period_ends_at;
ALTER TABLE teams DROP COLUMN IF EXISTS suspension_notified_at;
```

---

## Success Criteria

- ✅ All 4 migrations run without errors
- ✅ Existing teams have 2 folders each (default + trash)
- ✅ New teams automatically get folders on creation
- ✅ Constraint `user_id = team_id` enforced for team folders
- ✅ Cron job runs successfully (manual test)
- ✅ Warning banners appear when appropriate
- ✅ Suspended teams cannot execute workflows
- ✅ Team deletion migrates workflows to creator

---

## Maintenance

**Cron Job Schedule**: Every 6 hours (0 */6 * * *)

**Manual Enforcement** (if needed):
```bash
curl -X POST https://chainreact.app/api/cron/check-team-suspensions \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Future Enhancements**:
- Email notifications (currently just in-app banners)
- Admin dashboard for suspended teams
- Team reactivation flow
- Export team data before suspension
