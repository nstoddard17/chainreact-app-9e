# Production Database RLS Sync Instructions

**Generated:** October 20, 2025
**Source Database:** xzwsdwllmrnrgbltibxt (dev)
**Target Database:** gyrntsmtyshgukwrngpb (production)

## Summary

✅ **Completed Tasks:**
1. ✅ Removed all pending migration files from `supabase/migrations/`
2. ✅ Extracted 519 RLS policies from dev database
3. ✅ Compared dev and production schemas
4. ⏳ Ready to apply RLS policies to production

## Schema Comparison Results

### Tables
- **DEV:** 154 tables
- **PROD:** 157 tables (154 matching + 3 extra)

### Status: ✅ SCHEMAS ARE COMPATIBLE

All 154 core tables from dev exist in production. The 3 extra tables in production are:
- `beta_testers_admin_view` - Helper table
- `integration_health_summary` - Analytics table
- `token_health_summary` - Analytics table

These extra tables won't affect the RLS policy sync.

## RLS Policies

### Current Status
- **DEV:** 519 policies
- **PROD:** 0 policies

### Missing in Production
All 519 RLS policies need to be applied to production.

## Files Generated

1. **`apply_production_rls.sql`** (2,361 lines)
   - Complete RLS policy sync script
   - Ready to apply to production
   - Includes DROP + CREATE for all 519 policies
   - Enables RLS on all required tables

2. **`dev_rls_policies.json`**
   - Complete export of dev policies (for reference)

3. **`prod_rls_policies.json`**
   - Current production policies (empty)

4. **`schema_comparison.json`**
   - Detailed schema comparison data

## How to Apply RLS Policies to Production

### Step 1: Review the SQL File
```bash
# Open and review the file
cat apply_production_rls.sql | less
```

The file contains:
- DROP POLICY statements for all policies (safe, uses IF EXISTS)
- CREATE POLICY statements for all 519 policies
- ALTER TABLE ENABLE ROW LEVEL SECURITY for all tables

### Step 2: Apply to Production Database

**Option A: Using Supabase Dashboard (Recommended)**

1. Go to: https://supabase.com/dashboard/project/gyrntsmtyshgukwrngpb/sql/new

2. Copy the contents of `apply_production_rls.sql`

3. Paste into the SQL Editor

4. Click "Run" (this may take 1-2 minutes)

5. Verify success - you should see "Success. No rows returned"

**Option B: Using Supabase CLI** (Not currently working due to Docker requirement)

```bash
# Would need Docker running
export SUPABASE_ACCESS_TOKEN=sbp_1c2a955f3101b30852e3ed5b583b882b10703c8d
supabase link --project-ref gyrntsmtyshgukwrngpb
supabase db push
```

### Step 3: Verify RLS Policies Applied

Run this verification script:

```bash
python3 scripts/verify_rls_sync.py
```

Or manually check in Supabase Dashboard:
1. Go to Database > Policies
2. Select any table
3. Verify policies are present

## Sample of Policies Being Applied

### User-Owned Resources Pattern
Most tables follow this pattern:
- "Create own" - Users can INSERT their own records
- "View own" - Users can SELECT their own records
- "Update own" - Users can UPDATE their own records
- "Delete own" - Users can DELETE their own records
- "Service role bypass" - Service role can do anything

### Examples

**Workflows Table:**
- "Create own" - `auth.uid() = user_id`
- "View own" - `auth.uid() = user_id`
- "Update own" - `auth.uid() = user_id`
- "Delete own" - `auth.uid() = user_id`
- "Service role bypass" - `auth.jwt()->>'role' = 'service_role'`

**Integrations Table:**
- "Users can insert their own integrations" - `auth.uid() = user_id`
- "Users can view their own integrations" - `auth.uid() = user_id`
- "Users can update their own integrations" - `auth.uid() = user_id`
- "Users can delete their own integrations" - `auth.uid() = user_id`

**Organization Tables:**
- "Users can view their organizations" - Checks `organization_members`
- "Admin add" - Checks admin role in organization
- "Org owners can delete organizations" - Checks owner role

## Post-Application Verification

After applying the policies, verify:

### 1. Check Policy Count
```sql
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
-- Should return: 519
```

### 2. Check RLS Enabled
```sql
SELECT COUNT(*)
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = true;
-- Should return: 154
```

### 3. Test User Access
- Create a test user
- Try to access workflows/integrations
- Verify they can only see their own data

### 4. Test Service Role
- Verify API endpoints using service role still work
- Check background jobs can access all data

## Rollback Plan

If something goes wrong:

### Option 1: Drop All Policies
```sql
-- This will remove all RLS policies
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;
```

### Option 2: Disable RLS on All Tables
```sql
-- This will disable RLS on all tables
DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl.tablename);
  END LOOP;
END $$;
```

## Migration Files Cleanup

The following pending migrations were removed (already applied manually):
- 37 migration files from `20240924` to `20251020235445`
- `apply_rls_policies.sql` (had incorrect naming pattern)

**Remaining migrations** (already applied to both databases):
- `20240101000000_baseline_schema.sql`
- `20240115_create_learning_resources.sql`

## Next Steps

1. ✅ Review `apply_production_rls.sql`
2. ⏳ Apply to production using Supabase Dashboard
3. ⏳ Run verification
4. ⏳ Test application functionality
5. ⏳ Monitor for any access issues

## Support

If you encounter issues:
1. Check the Supabase Dashboard logs
2. Review error messages carefully
3. Use the rollback plan if needed
4. Contact Supabase support if problems persist

---

**IMPORTANT NOTES:**

- This operation is **SAFE** to run multiple times (uses IF EXISTS)
- RLS policies only affect user-level access via API
- Service role access is unaffected
- Background jobs using service role will continue working
- The sync is one-way: DEV → PROD
- Total execution time: ~1-2 minutes
- No downtime required
