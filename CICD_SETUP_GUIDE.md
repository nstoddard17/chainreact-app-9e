# CI/CD Setup Guide - Automated Database Migrations

## 🎯 What This Does

When you push code to GitHub, it automatically:
1. ✅ Detects if any migration files changed
2. ✅ Runs those migrations on your production database
3. ✅ Notifies you if something fails
4. ✅ Keeps dev and prod in sync

**No more manual SQL copying! 🎉**

---

## 🏗️ How It Works

```
┌─────────────────────────────────────────────────────┐
│ Developer Workflow                                   │
├─────────────────────────────────────────────────────┤
│ 1. Make schema change in dev                        │
│ 2. Create migration: supabase migration new feature │
│ 3. Test locally: supabase db push --linked         │
│ 4. Commit and push to GitHub                        │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│ GitHub Actions (Automatic)                          │
├─────────────────────────────────────────────────────┤
│ 1. Detects migration file change                   │
│ 2. Checks out your code                            │
│ 3. Installs Supabase CLI                           │
│ 4. Runs: supabase db push --db-url $PROD_URL      │
│ 5. Reports success or failure                      │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│ Production Database                                 │
├─────────────────────────────────────────────────────┤
│ ✅ Migration applied automatically                  │
│ ✅ Schema updated                                   │
│ ✅ Users see new features                          │
└─────────────────────────────────────────────────────┘
```

---

## 📋 Setup Steps

### Step 1: Add Secrets to GitHub

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these secrets:

**Secret 1: SUPABASE_PROD_DB_URL**
```
Name: SUPABASE_PROD_DB_URL
Value: postgresql://postgres.[PROD-REF]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
```

**Optional Secret 2: SUPABASE_STAGING_DB_URL**
```
Name: SUPABASE_STAGING_DB_URL
Value: postgresql://postgres.[STAGING-REF]:[PASSWORD]@...
```

**How to get these:**
- Go to Supabase Dashboard
- Settings → Database
- Connection string → URI
- Copy the "Transaction" pooler URL
- **Important:** Replace `[YOUR-PASSWORD]` with actual password

---

### Step 2: GitHub Actions File Already Created ✅

I've created `.github/workflows/deploy-database.yml` for you!

**What it does:**
- ✅ Triggers on push to `main` branch
- ✅ Only runs if migration files changed
- ✅ Installs Supabase CLI automatically
- ✅ Applies migrations to production
- ✅ Fails safely if something goes wrong

---

### Step 3: Test the Setup

**Option A: Test with a simple migration**

```bash
# Create a test migration
supabase migration new test_cicd_setup

# Add a simple test
echo "SELECT 1 as test;" > supabase/migrations/*_test_cicd_setup.sql

# Commit and push
git add .github/workflows/deploy-database.yml
git add supabase/migrations/*_test_cicd_setup.sql
git commit -m "test: Set up CI/CD for database migrations"
git push origin main
```

**Option B: Use existing migration**

```bash
# Just push the workflow file
git add .github/workflows/deploy-database.yml
git commit -m "ci: Add automated database deployment"
git push origin main

# Next time you add a migration, it will auto-deploy
```

---

## 📺 Monitoring Deployments

### View GitHub Actions Runs

1. Go to your GitHub repository
2. Click the **Actions** tab
3. You'll see all workflow runs
4. Click on a run to see detailed logs

**Example Log:**
```
🚀 Applying migrations to production...
Connecting to remote database...
Applying migration 20251120000000_add_new_feature.sql...
✅ Migrations applied successfully!
```

### Get Notifications

**Slack Notification (Optional):**
Add this to your workflow after the migration step:

```yaml
- name: Notify Slack on success
  if: success()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
    payload: |
      {
        "text": "✅ Database migrations deployed successfully!"
      }
```

**Discord Notification (Optional):**
```yaml
- name: Notify Discord
  if: success()
  run: |
    curl -X POST ${{ secrets.DISCORD_WEBHOOK_URL }} \
      -H 'Content-Type: application/json' \
      -d '{"content": "✅ Database migrations deployed!"}'
```

---

## 🔐 Security Best Practices

### 1. Protect Production Connection String
- ✅ Use GitHub Secrets (never commit to code)
- ✅ Use "Transaction" pooler (better performance)
- ✅ Rotate passwords regularly

### 2. Branch Protection
Add a rule in GitHub Settings → Branches:
- ✅ Require pull request reviews before merging to `main`
- ✅ Require status checks to pass (if you add tests)
- ✅ Prevent force pushes

### 3. Review Migrations
Always review migration SQL before merging:
- ✅ Check for destructive operations (DROP TABLE, etc.)
- ✅ Ensure it's wrapped in transaction (BEGIN/COMMIT)
- ✅ Add rollback notes in comments

---

## 🎓 Common Workflow Examples

### Example 1: Adding a New Feature

```bash
# 1. Create feature branch
git checkout -b feature/add-user-settings

# 2. Make schema change in dev dashboard
# (Add 'settings' column to user_profiles table)

# 3. Create migration
supabase migration new add_user_settings

# 4. Edit the migration file
cat > supabase/migrations/*_add_user_settings.sql << 'EOF'
BEGIN;

ALTER TABLE public.user_profiles
ADD COLUMN settings JSONB DEFAULT '{}';

CREATE INDEX idx_user_profiles_settings
ON public.user_profiles USING GIN (settings);

COMMIT;
EOF

# 5. Test locally
supabase db reset  # Reset to test from scratch
npm run dev        # Verify app works

# 6. Commit and push
git add supabase/migrations/
git commit -m "feat: Add user settings support"
git push origin feature/add-user-settings

# 7. Create PR on GitHub
# 8. Review and merge to main
# 9. GitHub Actions automatically deploys to prod! 🚀
```

---

### Example 2: Emergency Rollback

If a migration breaks production:

```bash
# 1. Create rollback migration immediately
supabase migration new rollback_bad_change

# 2. Write the undo SQL
cat > supabase/migrations/*_rollback_bad_change.sql << 'EOF'
BEGIN;

-- Undo the bad change
ALTER TABLE public.user_profiles
DROP COLUMN IF EXISTS problematic_column;

-- Remove the bad migration from history
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20251120000000';  -- Replace with bad version

COMMIT;
EOF

# 3. Push to main (bypasses CI if urgent)
git add supabase/migrations/
git commit -m "fix: Rollback problematic migration"
git push origin main

# 4. Or run manually for immediate fix
supabase db push --db-url "$PROD_URL"
```

---

## 🧪 Advanced: Staging Environment

Add a staging environment between dev and prod:

```yaml
name: Deploy with Staging

on:
  push:
    branches: [main]
    paths: ['supabase/migrations/**']

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - name: Deploy to staging
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_STAGING_DB_URL }}
        run: supabase db push --db-url "$SUPABASE_DB_URL"

  deploy-prod:
    needs: deploy-staging  # Only runs if staging succeeds
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - name: Deploy to production
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_PROD_DB_URL }}
        run: supabase db push --db-url "$SUPABASE_DB_URL"
```

---

## ✅ Verification Checklist

After setup, verify:

- [ ] GitHub Actions workflow file exists
- [ ] `SUPABASE_PROD_DB_URL` secret is set
- [ ] Test migration runs successfully
- [ ] Can see logs in GitHub Actions tab
- [ ] Production database is updated
- [ ] Team members can follow same workflow

---

## 🆘 Troubleshooting

### Error: "unknown flag: --db-url"
**Solution:** Update Supabase CLI:
```bash
npm install -g supabase@latest
# or
brew upgrade supabase
```

### Error: "permission denied for schema"
**Solution:** Check connection string has correct permissions. Use the "Transaction" pooler URL.

### Error: "relation already exists"
**Solution:** Migration already applied. Check `supabase_migrations.schema_migrations` table.

### Migration hangs forever
**Solution:** Add timeout to workflow:
```yaml
- name: Push migrations
  timeout-minutes: 10  # Add this
  run: supabase db push --db-url "$SUPABASE_DB_URL"
```

---

## 📊 Metrics & Monitoring

Track your migration health:

```sql
-- See all applied migrations
SELECT version, name, inserted_at
FROM supabase_migrations.schema_migrations
ORDER BY inserted_at DESC;

-- Check for failed migrations (if you add error tracking)
SELECT *
FROM migration_logs
WHERE status = 'failed'
ORDER BY created_at DESC;
```

---

## 🎯 Summary

**Setup Time:** ~15 minutes

**Benefits:**
- ✅ Automatic deployments
- ✅ No manual SQL copying
- ✅ Version controlled schema
- ✅ Safe rollbacks
- ✅ Team collaboration

**Workflow:**
```bash
Create migration → Test locally → Push to GitHub → Auto-deploy! 🚀
```

**What you need:**
1. `.github/workflows/deploy-database.yml` (✅ created)
2. `SUPABASE_PROD_DB_URL` secret (⏳ you add this)
3. Test push to confirm it works (⏳ after secrets added)

---

## 🚀 Next Steps

1. **Add the secret** to GitHub (5 minutes)
2. **Test with a simple migration** (5 minutes)
3. **Start using the workflow** for all future changes

After this, every migration is automatically deployed! 🎉

---

**Questions?** Check the troubleshooting section or open an issue.

**Last Updated:** 2025-11-20
