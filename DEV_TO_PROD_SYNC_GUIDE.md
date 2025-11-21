# Dev → Production Database Sync Guide

## 🎯 Goal
Automatically sync schema changes from dev database to production database using Supabase migrations.

---

## 📋 Current Setup Issues & Solutions

### ❌ Problem 1: Baseline Migration Conflicts
**Issue:** The `20240101000000_baseline_schema.sql` migration fails because:
- It expects `user_id` column but table has `owner_id`
- It expects `status` column but it doesn't exist
- It references columns that don't match actual schema

**Solution:** Don't use `--include-all` flag. The baseline is incompatible.

### ✅ Solution: Use Migration History Tracking

Supabase tracks which migrations have been applied via the `supabase_migrations.schema_migrations` table. Only unapplied migrations will run.

---

## 🔄 Recommended Workflow

### **Option 1: Manual Migration Files (Safest - RECOMMENDED)**

This is the most reliable approach for production databases.

#### Step 1: Make Changes in Dev Dashboard
1. Go to Supabase Dev Project Dashboard
2. Use SQL Editor to make schema changes
3. Test thoroughly in dev

#### Step 2: Export Changes as Migration
```bash
# Pull the latest schema from dev
supabase db pull --linked

# This creates a new migration file with the diff
# Review the generated migration in supabase/migrations/
```

#### Step 3: Apply to Production
```bash
# Option A: Use Supabase CLI
supabase db push --db-url "YOUR_PROD_CONNECTION_STRING"

# Option B: Use Production Dashboard
# 1. Copy migration file contents
# 2. Paste into Production SQL Editor
# 3. Execute
```

---

### **Option 2: Git-Based Workflow (Team Collaboration)**

Best for teams with multiple developers.

#### Setup:
1. **All schema changes go through migrations**
2. **Commit migrations to git**
3. **Deploy migrations in CI/CD pipeline**

#### Workflow:
```bash
# Developer makes a change
supabase migration new add_new_feature

# Edit the migration file
# supabase/migrations/TIMESTAMP_add_new_feature.sql

# Test locally
supabase db reset

# Commit to git
git add supabase/migrations/
git commit -m "Add new feature schema"
git push

# CI/CD applies to prod
supabase db push --db-url "$PROD_URL"
```

---

### **Option 3: Automatic Schema Sync (Not Recommended for Prod)**

⚠️ **WARNING:** This can be dangerous for production data.

```bash
# Pull current prod schema
supabase db pull --db-url "$PROD_URL"

# Apply all local migrations to prod
supabase db push --db-url "$PROD_URL"
```

**Risks:**
- Might drop tables with data
- No rollback capability
- Can't review changes before applying

---

## 🛠️ Fixing Your Current Setup

### Issue: Baseline Migration Blocks Everything

The `20240101000000_baseline_schema.sql` file is incompatible. Here's how to fix:

#### Option A: Skip Baseline (Quick Fix)
```bash
# Mark baseline as applied without running it
# This tells Supabase to ignore it
psql "$DEV_OR_PROD_URL" -c "
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20240101000000')
ON CONFLICT DO NOTHING;
"

# Now push remaining migrations
supabase db push --linked
```

#### Option B: Delete Baseline (Clean Fix)
```bash
# Remove the problematic file
rm supabase/migrations/20240101000000_baseline_schema.sql

# Push without baseline
supabase db push --linked
```

#### Option C: Fix Baseline to Match Schema
The baseline needs conditional checks for all columns. See the edits I made earlier - but honestly, it's easier to just skip or delete it.

---

## 📝 Your Specific Case

Based on the analysis, here's what you should do:

### Immediate Actions:

**1. Mark baseline as applied (don't run it):**
```bash
# Connect to your dev database
psql "postgresql://postgres.xzwsdwllmrnrgbltibxt:Lukelombardo10!@aws-0-us-east-1.pooler.supabase.com:6543/postgres" << 'EOF'
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20240101000000')
ON CONFLICT DO NOTHING;
EOF
```

**2. Push remaining migrations:**
```bash
supabase db push --linked
```

This will apply:
- ✅ `20251120164211_drop_duplicate_tables.sql` (already ran in dashboard)
- ✅ `20251120164226_create_critical_missing_tables.sql` (already ran in dashboard)

**3. For production database:**
```bash
# Option 1: Push to prod via CLI
supabase db push --db-url "YOUR_PROD_CONNECTION_STRING"

# Option 2: Copy migration files manually
# Copy contents of:
# - supabase/migrations/20251120144805_rename_tables_to_workflows.sql
# - supabase/migrations/20251120164211_drop_duplicate_tables.sql
# - supabase/migrations/20251120164226_create_critical_missing_tables.sql
# Paste and run in Production SQL Editor
```

---

## 🔐 Production Database URL

You need your production connection string. Get it from:

1. **Supabase Production Dashboard**
2. **Settings → Database**
3. **Connection String → URI (Transaction pooler recommended)**

Format:
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
```

---

## 🚀 Recommended Long-Term Setup

### 1. **Two Supabase Projects**
- **Dev Project:** For testing and development
- **Prod Project:** For production users

### 2. **GitHub Actions CI/CD** (Automated Deployment)

Create `.github/workflows/deploy-prod.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches:
      - main
    paths:
      - 'supabase/migrations/**'

jobs:
  deploy-db:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Apply migrations to production
        env:
          PROD_DB_URL: ${{ secrets.PROD_DB_URL }}
        run: |
          supabase db push --db-url "$PROD_DB_URL"
```

**Secrets to add in GitHub:**
- `PROD_DB_URL` - Your production connection string

### 3. **Migration Workflow**

```bash
# 1. Create feature branch
git checkout -b feature/add-new-table

# 2. Create migration
supabase migration new add_new_table

# 3. Write migration SQL
# Edit supabase/migrations/TIMESTAMP_add_new_table.sql

# 4. Test in local/dev
supabase db reset
npm run dev

# 5. Commit and push
git add supabase/migrations/
git commit -m "Add new table for feature X"
git push origin feature/add-new-table

# 6. Create PR and review

# 7. Merge to main → GitHub Actions auto-deploys to prod
```

---

## 🔍 Checking Migration Status

### See what's applied:
```bash
# Dev database
supabase db inspect --linked

# Production database
supabase db inspect --db-url "$PROD_URL"
```

### See migration history:
```bash
# Query the migrations table
psql "$DB_URL" -c "
SELECT version, name, inserted_at
FROM supabase_migrations.schema_migrations
ORDER BY version;
"
```

---

## ✅ Best Practices Summary

1. ✅ **Always use migration files** - Never make manual schema changes in prod
2. ✅ **Test migrations in dev first** - Catch issues before prod
3. ✅ **Version control migrations** - Commit to git
4. ✅ **Use transaction blocks** - Wrap migrations in BEGIN/COMMIT
5. ✅ **Add rollback notes** - Document how to undo changes
6. ✅ **Review before deploy** - Use PR reviews for prod migrations
7. ✅ **Backup before major changes** - Use Supabase backup feature
8. ✅ **Monitor after deploy** - Check logs and error rates

---

## 🆘 Emergency Rollback

If a migration breaks production:

```bash
# 1. Connect to prod
psql "$PROD_URL"

# 2. Start transaction
BEGIN;

# 3. Manually undo changes
DROP TABLE IF EXISTS problematic_table;
-- or
ALTER TABLE my_table DROP COLUMN problematic_column;

# 4. Remove migration record
DELETE FROM supabase_migrations.schema_migrations
WHERE version = 'TIMESTAMP_OF_BAD_MIGRATION';

# 5. Commit if successful, rollback if not
COMMIT;
-- or
ROLLBACK;
```

---

## 📞 Quick Reference

```bash
# Create new migration
supabase migration new <name>

# Apply to dev
supabase db push --linked

# Apply to prod
supabase db push --db-url "$PROD_URL"

# Pull current schema
supabase db pull --linked

# Reset local db (testing)
supabase db reset

# Check migration status
supabase db inspect --linked
```

---

## 🎓 Next Steps for Your Project

1. **Fix baseline issue** (mark as applied or delete)
2. **Push remaining migrations** to dev
3. **Get prod connection string** from Supabase dashboard
4. **Test migrations in dev** thoroughly
5. **Apply to prod** using one of the methods above
6. **Set up GitHub Actions** for future automation
7. **Create missing critical tables** from the DATABASE_SCHEMA_ANALYSIS.md report

---

**Last Updated:** 2025-11-20
**Migration Strategy:** Manual review with CLI deployment
