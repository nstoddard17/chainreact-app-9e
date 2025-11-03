# 🚀 Team Lifecycle Deployment - Quick Start

**5-Minute Deployment Guide**

---

## ✅ Pre-Flight Check

Run this in **Supabase Studio → SQL Editor**:

```sql
-- Copy/paste entire contents of: verify-deployment-ready.sql
```

This shows you:
- ✅ What already exists (safe to skip)
- ❌ What needs to be created
- ⚠️ Teams without folders (will be fixed automatically)

---

## 📝 Deployment (Choose One)

### Option A: Supabase Studio (Visual - Recommended)

**Go to Supabase Studio → SQL Editor**

Run these **one at a time** (copy entire file contents):

1. `supabase/migrations/20251103000001_add_team_lifecycle_columns.sql`
2. `supabase/migrations/20251103000002_create_team_folder_initialization.sql`
3. `supabase/migrations/20251103000003_create_workflow_migration_function.sql`
4. `supabase/migrations/20251103000004_create_suspension_notifications_table.sql`

✅ Safe to run even if columns already exist (uses `IF NOT EXISTS`)

---

### Option B: Supabase CLI (Command Line)

```bash
# Link to project (if not already)
supabase link --project-ref xzwsdwllmrnrgbltibxt

# Push all migrations
supabase db push
```

**If you get migration history errors:**
```bash
# Just repair and retry
supabase migration repair --status applied 20251103000001
supabase migration repair --status applied 20251103000002
supabase migration repair --status applied 20251103000003
supabase migration repair --status applied 20251103000004
supabase db push
```

---

## 🔑 Set Environment Variable

**Vercel Dashboard → Your Project → Settings → Environment Variables**

Add:
- **Key:** `CRON_SECRET`
- **Value:** (generate below)
- **Environments:** ✅ Production, ✅ Preview, ✅ Development

**Generate secret (Windows PowerShell):**
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

**Or use:** https://generate-secret.vercel.app/32

---

## 📦 Deploy Code

```bash
git add .
git commit -m "feat: Add team lifecycle management and billing enforcement"
git push origin main
```

Vercel auto-deploys + registers cron job.

---

## ✅ Verify (2 Minutes)

### 1. Check Cron Job

**Vercel Dashboard → Cron Jobs**

Should see:
```
/api/cron/check-team-suspensions
Every 6 hours (0 */6 * * *)
```

### 2. Test Cron Manually

```bash
curl "https://your-app.vercel.app/api/cron/check-team-suspensions?secret=YOUR_CRON_SECRET"
```

Expected: `{"success": true, "suspendedCount": 0}`

### 3. Create Test Team

Create a team in your UI → Check database:

```sql
SELECT wf.name, wf.is_default, wf.is_trash, t.name as team_name
FROM workflow_folders wf
JOIN teams t ON wf.team_id = t.id
WHERE t.name = 'YOUR_TEST_TEAM'
ORDER BY wf.is_default DESC;
```

Expected: 2 rows (root folder + trash folder)

---

## 🎉 Done!

**That's it! The system is live.**

### What Happens Now:

**When user cancels subscription:**
1. Shows warning 7 days before expiration
2. Downgrades user on cancellation date
3. Sets 5-day grace period for teams
4. Cron job suspends teams after 5 days
5. Workflows migrated to creator's folder (not deleted)

**UI warnings appear automatically:**
- 7 days before: Yellow "subscription expiring" banner
- After downgrade: Yellow "grace period" banner for teams
- After suspension: Red "team suspended" banner

---

## 📚 Full Documentation

For complete details, troubleshooting, and advanced features:
- **[DEPLOYMENT_STEPS.md](DEPLOYMENT_STEPS.md)** - Detailed step-by-step guide
- **[team-lifecycle-and-billing-enforcement.md](learning/docs/team-lifecycle-and-billing-enforcement.md)** - Complete system documentation
- **[billing-warning-timeline.md](learning/docs/billing-warning-timeline.md)** - Visual timeline and user journey

---

## 🐛 Quick Troubleshooting

**Cron returns 401:**
→ `CRON_SECRET` not set in Vercel

**Migration fails:**
→ Run `verify-deployment-ready.sql` to see what exists
→ Migrations are safe to re-run (use `IF NOT EXISTS`)

**Banner not showing:**
→ Add `<BillingWarningBanners userId={user.id} />` to your layout

**Workflows not blocked:**
→ Verify team has `suspended_at` set in database

---

**Questions?** See [DEPLOYMENT_STEPS.md](DEPLOYMENT_STEPS.md) for detailed troubleshooting.
