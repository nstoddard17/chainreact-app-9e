# Team Lifecycle Deployment - Step by Step

## ⚠️ Pre-Deployment Check

**IMPORTANT:** You mentioned `is_trash` and `team_id` columns already exist in `workflow_folders`.

Let's verify this first in Supabase Studio:

### Check Current Schema

Go to **Supabase Studio → SQL Editor** and run:

```sql
-- Check workflow_folders columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'workflow_folders'
AND column_name IN ('is_trash', 'team_id')
ORDER BY column_name;

-- Check teams columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'teams'
AND column_name IN ('suspended_at', 'suspension_reason', 'grace_period_ends_at', 'suspension_notified_at')
ORDER BY column_name;

-- Check workflows columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'workflows'
AND column_name = 'team_id';
```

**Expected Results:**

If columns **already exist**, you'll see them listed.
If they **don't exist**, the query returns 0 rows for those columns.

---

## 📝 Deployment Plan

Based on what exists, we have **2 options**:

### Option A: Columns Already Exist (Safe - Use This If Unsure)

The migrations use `ADD COLUMN IF NOT EXISTS`, so they're **safe to run even if columns exist**.

### Option B: Columns Don't Exist (Standard Migration)

Run all 4 migrations normally.

---

## 🚀 Step 1: Apply Database Migrations

### Using Supabase Studio (Recommended - Visual)

Go to **Supabase Studio → SQL Editor** and run each migration **one at a time**:

#### Migration 1: Add Lifecycle Columns
Copy and paste the entire contents of:
`supabase/migrations/20251103000001_add_team_lifecycle_columns.sql`

Click **Run**

✅ Expected: "Success. No rows returned"

---

#### Migration 2: Team Folder Initialization
Copy and paste the entire contents of:
`supabase/migrations/20251103000002_create_team_folder_initialization.sql`

Click **Run**

✅ Expected: You'll see notices like:
```
NOTICE: Creating folders for team: Acme Corp (id: ...)
NOTICE: Created root folder (id: ...) and trash folder for team: Acme Corp
```

This creates folders for any existing teams.

---

#### Migration 3: Workflow Migration Functions
Copy and paste the entire contents of:
`supabase/migrations/20251103000003_create_workflow_migration_function.sql`

Click **Run**

✅ Expected: "Success. No rows returned"

---

#### Migration 4: Notification System
Copy and paste the entire contents of:
`supabase/migrations/20251103000004_create_suspension_notifications_table.sql`

Click **Run**

✅ Expected: "Success. No rows returned"

---

### Using Supabase CLI (Alternative)

If you prefer CLI:

```bash
# Make sure you're linked to the project
supabase link --project-ref xzwsdwllmrnrgbltibxt

# Push all migrations
supabase db push
```

**If you get migration history mismatch errors:**

```bash
# Repair migration history (use the suggested commands from the error)
supabase migration repair --status applied 20251103000001
supabase migration repair --status applied 20251103000002
supabase migration repair --status applied 20251103000003
supabase migration repair --status applied 20251103000004

# Then push again
supabase db push
```

---

## ✅ Step 2: Verify Database Changes

Run these verification queries in Supabase Studio SQL Editor:

```sql
-- 1. Verify columns were added
SELECT column_name
FROM information_schema.columns
WHERE table_name IN ('workflow_folders', 'teams', 'workflows')
AND column_name IN ('is_trash', 'team_id', 'suspended_at', 'suspension_reason', 'grace_period_ends_at')
ORDER BY table_name, column_name;

-- Expected: 7 rows showing all new columns

-- 2. Verify functions were created
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
  'initialize_team_folders',
  'migrate_team_workflows_to_creator',
  'get_or_create_user_default_folder',
  'create_suspension_notification',
  'notify_team_owner_of_grace_period',
  'handle_team_suspension'
)
ORDER BY routine_name;

-- Expected: 6 functions

-- 3. Verify triggers were created
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name IN (
  'initialize_team_folders_trigger',
  'migrate_workflows_before_team_delete',
  'notify_grace_period_trigger',
  'handle_team_suspension_trigger'
)
ORDER BY trigger_name;

-- Expected: 4 triggers

-- 4. Verify team_suspension_notifications table exists
SELECT COUNT(*) as table_exists
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'team_suspension_notifications';

-- Expected: 1

-- 5. Check if existing teams have folders
SELECT
  t.id,
  t.name,
  COUNT(DISTINCT CASE WHEN wf.is_default = TRUE THEN wf.id END) as has_root_folder,
  COUNT(DISTINCT CASE WHEN wf.is_trash = TRUE THEN wf.id END) as has_trash_folder
FROM teams t
LEFT JOIN workflow_folders wf ON wf.team_id = t.id
GROUP BY t.id, t.name
ORDER BY t.name;

-- Expected: Each team should have 1 root folder and 1 trash folder
```

**If any checks fail, STOP and troubleshoot before continuing.**

---

## 🔑 Step 3: Set Environment Variables

### In Vercel Dashboard:

1. Go to your project → **Settings** → **Environment Variables**
2. Add new variable:
   - **Key:** `CRON_SECRET`
   - **Value:** (generate below)
   - **Environments:** ✅ Production, ✅ Preview, ✅ Development

**Generate a secure secret:**

**Windows PowerShell:**
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

**Git Bash / WSL:**
```bash
openssl rand -base64 32
```

**Online:** https://generate-secret.vercel.app/32

3. Click **Save**

### For Local Development:

Add to `.env.local`:
```bash
CRON_SECRET=<your-generated-secret>
```

---

## 📦 Step 4: Deploy Code to Vercel

### Option A: Push to GitHub (Recommended)

```bash
cd "c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e"

# Stage all changes
git add .

# Commit with descriptive message
git commit -m "feat: Add team lifecycle management and billing enforcement

- Add is_trash and team_id columns to workflow_folders
- Create team folder initialization (root + trash)
- Implement 5-day grace period for account downgrades
- Add workflow migration on team deletion
- Create suspension notification system
- Add cron job for suspension enforcement (every 6 hours)
- Block workflow execution for suspended teams
- Add pre-cancellation warning (7 days before expiration)
- Add SubscriptionExpirationBanner and TeamSuspensionBanner components
- Update Stripe webhook to trigger grace periods

See: learning/docs/team-lifecycle-and-billing-enforcement.md
See: learning/docs/billing-warning-timeline.md"

# Push to main (or your deployment branch)
git push origin main
```

Vercel will automatically:
- Deploy the new code
- Register the cron job from `vercel.json`

### Option B: Deploy via Vercel CLI

```bash
vercel --prod
```

---

## ✅ Step 5: Verify Deployment

### A. Check Vercel Dashboard

1. Go to **Vercel Dashboard** → Your Project
2. Check **Deployments** tab
3. Wait for deployment to complete (green ✓)

### B. Verify Cron Job Registered

1. Go to **Vercel Dashboard** → Your Project → **Cron Jobs**
2. You should see:
   ```
   /api/cron/check-team-suspensions
   Schedule: 0 */6 * * * (Every 6 hours)
   Status: Active
   ```

### C. Test Cron Job Manually

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

If you get `401 Unauthorized`, your `CRON_SECRET` is not set correctly.

---

## 🧪 Step 6: Test the Complete Flow

### Test 1: Team Folder Creation

1. **Create a new team** via your UI
2. **Check database:**

```sql
SELECT
  wf.id,
  wf.name,
  wf.is_default,
  wf.is_trash,
  t.name as team_name
FROM workflow_folders wf
JOIN teams t ON wf.team_id = t.id
WHERE t.name = 'YOUR_NEW_TEAM_NAME'
ORDER BY wf.is_default DESC;
```

**Expected:** 2 rows (root folder with `is_default=true`, trash folder with `is_trash=true`)

---

### Test 2: Grace Period Trigger

1. **Create a test team** (or use existing)
2. **Manually trigger grace period:**

```bash
curl -X POST "https://your-app.vercel.app/api/teams/YOUR_TEAM_ID/suspend" \
  -H "Content-Type: application/json" \
  -H "Cookie: YOUR_SESSION_COOKIE" \
  -d '{
    "action": "suspend",
    "reason": "owner_downgraded",
    "gracePeriodDays": 1
  }'
```

3. **Check database:**

```sql
SELECT
  t.id,
  t.name,
  t.grace_period_ends_at,
  t.suspension_reason,
  t.suspended_at
FROM teams t
WHERE t.id = 'YOUR_TEAM_ID';

-- Also check notification was created
SELECT * FROM team_suspension_notifications
WHERE team_id = 'YOUR_TEAM_ID'
ORDER BY sent_at DESC;
```

**Expected:** `grace_period_ends_at` set to ~1 day from now, notification record exists

---

### Test 3: UI Warnings

1. **Login to your app**
2. **Navigate to dashboard**
3. **You should see banner** if team is in grace period

If banner doesn't appear:
- Check browser console for errors
- Verify user is logged in
- Verify user owns the team

---

### Test 4: Workflow Execution Guard

1. **Manually suspend a test team:**

```sql
UPDATE teams
SET suspended_at = NOW(),
    suspension_reason = 'manual_suspension'
WHERE id = 'YOUR_TEST_TEAM_ID';
```

2. **Try to execute a workflow from that team** (via UI or API)

**Expected:** Error 403 with message:
```json
{
  "error": "This workflow belongs to team 'Test Team' which has been suspended due to: manual_suspension",
  "suspendedAt": "2025-11-03T...",
  "suspensionReason": "manual_suspension"
}
```

3. **Unsuspend the team:**

```sql
UPDATE teams
SET suspended_at = NULL,
    suspension_reason = NULL,
    grace_period_ends_at = NULL
WHERE id = 'YOUR_TEST_TEAM_ID';
```

---

### Test 5: Workflow Migration on Team Deletion

⚠️ **Use a TEST team for this!**

1. **Create a test team with workflows**
2. **Note the workflow IDs**
3. **Note the creator's user ID**
4. **Delete the team** (via UI or API)
5. **Check workflows migrated:**

```sql
-- Workflows should have team_id = NULL and be in creator's folder
SELECT
  w.id,
  w.name,
  w.team_id,
  w.folder_id,
  wf.name as folder_name,
  wf.user_id as folder_owner
FROM workflows w
LEFT JOIN workflow_folders wf ON w.folder_id = wf.id
WHERE w.id IN ('YOUR_TEST_WORKFLOW_IDS')
ORDER BY w.name;
```

**Expected:**
- `team_id` is NULL
- `folder_id` points to creator's default folder
- Workflows still exist (not deleted)

---

## 🎯 Step 7: Production Test (Real Subscription)

⚠️ **Only do this if you're ready to test with real billing**

### Test Real Stripe Webhook

1. **Create a test subscription** in Stripe Dashboard (test mode)
2. **Cancel the subscription** in Stripe Dashboard
3. **Check your database:**

```sql
-- User should be downgraded
SELECT id, email, role FROM user_profiles
WHERE id = 'TEST_USER_ID';
-- Expected: role = 'free'

-- User's teams should have grace period
SELECT
  t.id,
  t.name,
  t.grace_period_ends_at,
  t.suspension_reason
FROM teams t
WHERE t.created_by = 'TEST_USER_ID';
-- Expected: grace_period_ends_at set to 5 days from now
```

4. **Check application logs** in Vercel:

```
[Stripe Webhook] Handling downgrade for user <user_id>
[Stripe Webhook] Found X teams owned by user <user_id>
[Stripe Webhook] Set 5-day grace period for team "<team_name>"
```

---

## 📊 Step 8: Monitor First 24 Hours

### Check These Metrics:

1. **Cron job runs successfully** (every 6 hours)
   - Vercel Dashboard → Cron Jobs → Logs

2. **No errors in application logs**
   - Vercel Dashboard → Logs
   - Filter by `/api/cron/check-team-suspensions`

3. **Database queries execute quickly**
   - Check Supabase Dashboard → Database → Query Performance

4. **UI banners render correctly**
   - Test on both light and dark mode
   - Test on mobile and desktop

---

## 🐛 Troubleshooting

### Issue: Migration fails with "column already exists"

**Solution:** Migrations use `IF NOT EXISTS`, so this shouldn't happen. If it does:
1. Check which migration failed
2. Manually verify the column exists: `\d workflow_folders` in psql
3. Skip to next migration

### Issue: Cron job returns 401

**Solution:** `CRON_SECRET` not set correctly
1. Verify in Vercel → Settings → Environment Variables
2. Re-deploy: `vercel --prod --force`

### Issue: UI banner not showing

**Solution:** Check browser console for errors
1. Verify user is logged in
2. Verify component is imported
3. Verify user has teams or subscription

### Issue: Workflow execution not blocked

**Solution:** Check team suspension check code
1. Verify workflow has `team_id` set
2. Verify team has `suspended_at` set
3. Check `/api/workflows/execute` logs

---

## ✅ Success Checklist

- [ ] All 4 migrations applied successfully
- [ ] All verification queries pass
- [ ] `CRON_SECRET` set in Vercel
- [ ] Code deployed to Vercel
- [ ] Cron job appears in Vercel dashboard
- [ ] Cron job test returns success
- [ ] New team creates folders automatically
- [ ] Manual grace period trigger works
- [ ] UI banner shows for grace period teams
- [ ] Suspended teams block workflow execution
- [ ] Workflow migration on deletion works
- [ ] No errors in production logs

---

## 🎉 Post-Deployment

Once everything is verified:

1. **Update CLAUDE.md** to mark feature as deployed
2. **Monitor for 1 week** for any edge cases
3. **Gather feedback** from beta users
4. **Consider email integration** (next phase)

---

## 📞 Need Help?

If you encounter issues:
1. Check logs in Vercel Dashboard
2. Check database in Supabase Studio
3. Review documentation: `learning/docs/team-lifecycle-and-billing-enforcement.md`
4. Check the troubleshooting section above

---

**Deployment Date:** _______________
**Deployed By:** _______________
**Production URL:** _______________
