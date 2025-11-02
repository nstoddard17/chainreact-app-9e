# Deployment Checklist: Team Lifecycle & Billing Enforcement

**Feature:** Complete team lifecycle management with grace periods, notifications, and billing enforcement

---

## 📋 Pre-Deployment Checklist

### ✅ Code Changes
- [x] Database migrations created (4 files)
- [x] API routes created (cron + suspend endpoint)
- [x] Stripe webhook updated with grace period logic
- [x] Workflow execution guard added
- [x] UI notification component created
- [x] Vercel cron configuration updated
- [x] Documentation written

### ✅ Database Changes
- [x] `workflow_folders` columns: `is_trash`, `team_id`
- [x] `teams` columns: `suspended_at`, `suspension_reason`, `grace_period_ends_at`, `suspension_notified_at`
- [x] `workflows` column: `team_id`
- [x] New table: `team_suspension_notifications`
- [x] Database functions: `initialize_team_folders()`, `migrate_team_workflows_to_creator()`, `get_or_create_user_default_folder()`, `create_suspension_notification()`
- [x] Database triggers: `initialize_team_folders_trigger`, `migrate_workflows_before_team_delete`, `notify_grace_period_trigger`

---

## 🚀 Deployment Steps

### Step 1: Database Migrations

**Option A: Using Supabase CLI (Recommended)**
```bash
# Link to your project (if not already linked)
supabase link --project-ref xzwsdwllmrnrgbltibxt

# Apply all migrations
supabase db push
```

**Option B: Manual SQL Execution**
Run these in Supabase Studio SQL Editor **in order**:

1. `supabase/migrations/20251103000001_add_team_lifecycle_columns.sql`
2. `supabase/migrations/20251103000002_create_team_folder_initialization.sql`
3. `supabase/migrations/20251103000003_create_workflow_migration_function.sql`
4. `supabase/migrations/20251103000004_create_suspension_notifications_table.sql`

**Verify migrations:**
```sql
-- Check new columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'workflow_folders'
AND column_name IN ('is_trash', 'team_id');

-- Check new table exists
SELECT * FROM team_suspension_notifications LIMIT 1;

-- Check functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_name IN (
  'initialize_team_folders',
  'migrate_team_workflows_to_creator',
  'create_suspension_notification'
);
```

---

### Step 2: Environment Variables

Add to Vercel environment variables (or `.env.local` for local):

```bash
CRON_SECRET=<generate-random-secret>
```

**Generate secret:**
```bash
openssl rand -base64 32
```

**In Vercel Dashboard:**
1. Go to Project → Settings → Environment Variables
2. Add new variable:
   - Key: `CRON_SECRET`
   - Value: `<your-generated-secret>`
   - Environment: Production, Preview, Development

---

### Step 3: Deploy Code

```bash
# Commit changes
git add .
git commit -m "feat: Add team lifecycle management and billing enforcement

- Add is_trash and team_id columns to workflow_folders
- Create team folder initialization (root + trash)
- Implement 5-day grace period for account downgrades
- Add workflow migration on team deletion (move to creator's folder)
- Create suspension notification system
- Add cron job for suspension enforcement (every 6 hours)
- Block workflow execution for suspended teams
- Add TeamSuspensionBanner UI component
- Update Stripe webhook to trigger grace periods

See: learning/docs/team-lifecycle-and-billing-enforcement.md"

# Push to main (or your deployment branch)
git push origin main
```

Vercel will automatically deploy and register the new cron job.

---

### Step 4: Verify Deployment

#### A. Check Cron Job Registration
1. Open Vercel Dashboard
2. Go to your project → Cron Jobs
3. Verify you see:
   ```
   /api/cron/check-team-suspensions
   Schedule: 0 */6 * * * (Every 6 hours)
   ```

#### B. Test Cron Job Manually
```bash
curl -X GET "https://your-app.vercel.app/api/cron/check-team-suspensions?secret=YOUR_CRON_SECRET"
```

**Expected response:**
```json
{
  "success": true,
  "suspendedCount": 0,
  "suspendedTeams": [],
  "reminders": {
    "threeDaySent": 0,
    "oneDaySent": 0
  }
}
```

#### C. Test Team Folder Creation
```bash
# Create a test team via your UI
# Then check in Supabase:
SELECT * FROM workflow_folders
WHERE team_id = '<your-test-team-id>'
AND (is_default = true OR is_trash = true);
```

**Expected:** 2 rows (root folder + trash folder)

#### D. Test Grace Period Trigger
```bash
# Set grace period for a test team
curl -X POST "https://your-app.vercel.app/api/teams/<test-team-id>/suspend" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "suspend",
    "reason": "manual_suspension",
    "gracePeriodDays": 1
  }'
```

**Check:**
```sql
-- Verify grace period set
SELECT id, name, grace_period_ends_at, suspension_reason
FROM teams
WHERE id = '<test-team-id>';

-- Verify notification created
SELECT * FROM team_suspension_notifications
WHERE team_id = '<test-team-id>';
```

#### E. Test Workflow Execution Guard
```bash
# First, suspend a test team (set suspended_at)
UPDATE teams SET suspended_at = NOW() WHERE id = '<test-team-id>';

# Try to execute a workflow from that team
curl -X POST "https://your-app.vercel.app/api/workflows/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "<workflow-id-from-suspended-team>"
  }'
```

**Expected response:**
```json
{
  "error": "This workflow belongs to team 'Test Team' which has been suspended due to: manual_suspension",
  "suspendedAt": "2025-11-03T...",
  "suspensionReason": "manual_suspension"
}
```

#### F. Test Workflow Migration on Team Deletion
```bash
# Create test team with a workflow
# Note the workflow ID and creator's user ID
# Delete the team via UI or API

# Check workflow migrated to creator's folder
SELECT id, name, team_id, folder_id
FROM workflows
WHERE id = '<test-workflow-id>';

-- team_id should be NULL
-- folder_id should be creator's default folder
```

---

## 🧪 Full Integration Test

Run this complete flow to verify everything works:

### Test Scenario: User Downgrade → Grace Period → Suspension

```bash
# 1. Create a test user with Pro subscription
# 2. Create a team as that user
# 3. Create a workflow in that team
# 4. Cancel the user's subscription in Stripe Dashboard

# This should trigger:
# - Stripe webhook → handleSubscriptionDeleted
# - handleUserDowngrade sets grace_period_ends_at
# - Database trigger creates notification

# 5. Check grace period was set
SELECT id, name, grace_period_ends_at, suspension_reason
FROM teams
WHERE created_by = '<test-user-id>';

# 6. Check notification was created
SELECT * FROM team_suspension_notifications
WHERE user_id = '<test-user-id>';

# 7. Load UI with test user logged in
# - You should see TeamSuspensionBanner with grace period warning

# 8. Manually trigger suspension (for testing)
UPDATE teams
SET grace_period_ends_at = NOW() - INTERVAL '1 hour'
WHERE created_by = '<test-user-id>';

# 9. Run cron job
curl "https://your-app.vercel.app/api/cron/check-team-suspensions?secret=YOUR_SECRET"

# 10. Verify team is now suspended
SELECT id, name, suspended_at, suspension_reason
FROM teams
WHERE created_by = '<test-user-id>';

# 11. Try to execute workflow → Should fail with 403
# 12. Delete the team
# 13. Verify workflows migrated to creator's default folder
```

---

## 🔍 Monitoring

### Logs to Watch

**Stripe Webhook Logs:**
```
[Stripe Webhook] Handling downgrade for user <user_id>
[Stripe Webhook] Found X teams owned by user <user_id>
[Stripe Webhook] Set 5-day grace period for team "<team_name>"
```

**Cron Job Logs:**
```
[Cron] Starting team suspension check...
[Cron] Found X teams with expired grace periods
[Cron] Suspending team <team_name> (<team_id>)...
[Cron] Successfully suspended team <team_name>
```

**Workflow Execution Logs:**
```
Workflow execution blocked: Team "<team_name>" is suspended (reason: owner_downgraded)
```

### Database Queries for Monitoring

```sql
-- Teams in grace period
SELECT id, name, created_by, grace_period_ends_at,
       EXTRACT(DAY FROM (grace_period_ends_at - NOW())) AS days_remaining
FROM teams
WHERE suspended_at IS NULL
AND grace_period_ends_at IS NOT NULL
ORDER BY grace_period_ends_at ASC;

-- Suspended teams
SELECT id, name, suspended_at, suspension_reason
FROM teams
WHERE suspended_at IS NOT NULL;

-- Pending notifications
SELECT n.*, t.name AS team_name, u.email
FROM team_suspension_notifications n
JOIN teams t ON n.team_id = t.id
JOIN auth.users u ON n.user_id = u.id
WHERE n.read_at IS NULL
ORDER BY n.sent_at DESC;
```

---

## ✅ Post-Deployment Verification

Once deployed, verify:

- [ ] Cron job appears in Vercel dashboard
- [ ] Creating a team creates root + trash folders
- [ ] Test user downgrade triggers grace period
- [ ] Grace period notification appears in database
- [ ] TeamSuspensionBanner shows on UI
- [ ] Cron job suspends teams after grace period
- [ ] Suspended teams block workflow execution
- [ ] Deleting team migrates workflows to creator
- [ ] Manual suspend/unsuspend works via API
- [ ] Logs show expected messages

---

## 🐛 Rollback Plan

If issues occur, rollback with:

### Option 1: Revert Git Commit
```bash
git revert HEAD
git push origin main
```

### Option 2: Disable Cron Job
In Vercel dashboard → Cron Jobs → Disable `/api/cron/check-team-suspensions`

### Option 3: Database Rollback
```sql
-- Remove grace periods from all teams
UPDATE teams SET grace_period_ends_at = NULL, suspension_reason = NULL;

-- Unsuspend all teams
UPDATE teams SET suspended_at = NULL;

-- Drop new columns (CAREFUL - data loss)
ALTER TABLE workflow_folders DROP COLUMN IF EXISTS is_trash;
ALTER TABLE workflow_folders DROP COLUMN IF EXISTS team_id;
ALTER TABLE teams DROP COLUMN IF EXISTS suspended_at;
ALTER TABLE teams DROP COLUMN IF EXISTS suspension_reason;
ALTER TABLE teams DROP COLUMN IF EXISTS grace_period_ends_at;

-- Drop new table
DROP TABLE IF EXISTS team_suspension_notifications;
```

---

## 📞 Support

If you encounter issues:

1. **Check logs:** Vercel dashboard → Logs
2. **Check database:** Supabase dashboard → SQL Editor
3. **Review documentation:** `learning/docs/team-lifecycle-and-billing-enforcement.md`
4. **Test locally:** Run with `npm run dev` and test each flow

---

## ✨ Success Criteria

**Deployment is successful when:**

✅ All 4 database migrations applied without errors
✅ Cron job shows in Vercel dashboard
✅ Creating a team creates 2 folders (root + trash)
✅ User downgrade triggers 5-day grace period
✅ Notifications created in database
✅ UI shows warning banners for grace period teams
✅ Suspended teams block workflow execution (403 error)
✅ Deleting team moves workflows to creator's folder (not deleted)
✅ No errors in production logs

**Once verified, mark this feature as ✅ DEPLOYED in CLAUDE.md**

---

**Date Deployed:** _________________
**Deployed By:** _________________
**Verified By:** _________________
