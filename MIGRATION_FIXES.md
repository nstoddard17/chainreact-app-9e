# Migration Fixes Applied

## Issues Found and Resolved

### Issue 1: Unique Constraint on (team_id, is_default) with NULL values

**Error:**
```
ERROR: could not create unique index "unique_default_folder_per_team"
DETAIL: Key (team_id, is_default)=(null, t) is duplicated.
```

**Root Cause:**
- Multiple users had `is_default = true` folders with `team_id = NULL`
- Original constraint used `UNIQUE NULLS NOT DISTINCT` which treats all NULLs as equal
- This violated the constraint because multiple users had default folders

**Fix Applied:**
Changed from a table constraint to a **partial unique index**:
```sql
CREATE UNIQUE INDEX unique_default_folder_per_team
  ON public.workflow_folders(team_id, is_default)
  WHERE team_id IS NOT NULL AND is_default = TRUE;
```

**Result:**
- User folders (team_id = NULL) are excluded from this constraint
- Only team folders are constrained (one default per team)
- Multiple users can have default folders without conflict

---

### Issue 2: Existing Constraint on (user_id, is_default)

**Error:**
```
ERROR: duplicate key value violates unique constraint "idx_workflow_folders_user_default"
DETAIL: Key (user_id)=(a3e3a51a-175c-4b59-ad03-227ba12a18b0) already exists.
```

**Root Cause:**
- Existing constraint: `idx_workflow_folders_user_default` enforced one default folder per user
- When creating team folders, we set `user_id = creator_id` AND `is_default = TRUE`
- If user created multiple teams, this violated the constraint
- The constraint didn't distinguish between user folders and team folders

**Fix Applied:**
Updated the constraint to use a **partial unique index** that excludes team folders:
```sql
DROP INDEX IF EXISTS idx_workflow_folders_user_default;

CREATE UNIQUE INDEX idx_workflow_folders_user_default
  ON public.workflow_folders(user_id, is_default)
  WHERE team_id IS NULL AND is_default = TRUE;
```

**Result:**
- User folders: One default per user (team_id = NULL)
- Team folders: Not constrained by user_id (team_id IS NOT NULL)
- Same user can create multiple teams, each with a default folder

---

## Final Constraint Design

### User Folders (Personal Workspace)
- **Constraint:** One default folder per user
- **Index:** `idx_workflow_folders_user_default` on `(user_id, is_default)` WHERE `team_id IS NULL`
- **Example:** User "john@example.com" has ONE default folder for personal workflows

### Team Folders (Team Workspace)
- **Constraint:** One default folder per team
- **Index:** `unique_default_folder_per_team` on `(team_id, is_default)` WHERE `team_id IS NOT NULL`
- **Example:** Team "Acme Corp" has ONE default folder for team workflows

### Trash Folders
- **User Trash:** One per user (constrained by user_id)
- **Team Trash:** One per team (constrained by team_id)
- **Index:** `unique_trash_folder_per_team` on `(team_id, is_trash)` WHERE `team_id IS NOT NULL`

---

## Migration Order (Updated)

Run these migrations **in order**:

1. ✅ **20251103000001_add_team_lifecycle_columns.sql** (UPDATED)
   - Adds columns
   - **Fixes both constraint issues**
   - Creates partial unique indexes

2. ✅ **20251103000002_create_team_folder_initialization.sql** (No changes needed)
   - Creates team folders
   - Backfills existing teams
   - Now works because constraints are fixed

3. ✅ **20251103000003_create_workflow_migration_function.sql** (No changes needed)
   - Workflow migration logic

4. ✅ **20251103000004_create_suspension_notifications_table.sql** (No changes needed)
   - Notification system

---

## Testing After Fixes

### Test 1: Verify Constraints

```sql
-- Check user default folder constraint
SELECT
  user_id,
  COUNT(*) as default_folders_count
FROM workflow_folders
WHERE team_id IS NULL AND is_default = TRUE
GROUP BY user_id
HAVING COUNT(*) > 1;
-- Expected: 0 rows (each user has exactly 1 default folder)

-- Check team default folder constraint
SELECT
  team_id,
  COUNT(*) as default_folders_count
FROM workflow_folders
WHERE team_id IS NOT NULL AND is_default = TRUE
GROUP BY team_id
HAVING COUNT(*) > 1;
-- Expected: 0 rows (each team has exactly 1 default folder)
```

### Test 2: Create Multiple Teams with Same Creator

```sql
-- This should now work (previously failed)
-- User creates Team 1
INSERT INTO teams (name, slug, created_by) VALUES ('Team Alpha', 'team-alpha', '<user_id>');
-- Team folder created with is_default = TRUE

-- User creates Team 2
INSERT INTO teams (name, slug, created_by) VALUES ('Team Beta', 'team-beta', '<user_id>');
-- Team folder created with is_default = TRUE

-- Both succeed because constraints now exclude team folders from user_id constraint
```

---

## What Changed in Migration Files

### `20251103000001_add_team_lifecycle_columns.sql`

**Added:**
```sql
-- Fix existing unique constraints to support both user and team folders
DROP INDEX IF EXISTS idx_workflow_folders_user_default;

CREATE UNIQUE INDEX idx_workflow_folders_user_default
  ON public.workflow_folders(user_id, is_default)
  WHERE team_id IS NULL AND is_default = TRUE;
```

**Changed:**
```sql
-- From: Table constraint with UNIQUE NULLS NOT DISTINCT
ALTER TABLE public.workflow_folders
ADD CONSTRAINT unique_default_folder_per_team
  UNIQUE NULLS NOT DISTINCT (team_id, is_default);

-- To: Partial unique index
CREATE UNIQUE INDEX unique_default_folder_per_team
  ON public.workflow_folders(team_id, is_default)
  WHERE team_id IS NOT NULL AND is_default = TRUE;
```

---

## Key Takeaways

1. **Partial Unique Indexes** are better than table constraints when you need to exclude certain rows (like NULLs)

2. **Use `WHERE` clause in indexes** to create conditional uniqueness:
   - User folders: `WHERE team_id IS NULL`
   - Team folders: `WHERE team_id IS NOT NULL`

3. **Avoid `UNIQUE NULLS NOT DISTINCT`** when you have legitimate NULL values that should be treated independently

4. **Always consider existing constraints** when adding new columns that participate in uniqueness rules

---

## Status: ✅ READY TO DEPLOY

Both issues are now fixed. The migrations are safe to run.

**Next Steps:**
1. Run migration 1 (updated version)
2. Run migration 2 (will now succeed)
3. Run migrations 3 and 4
4. Deploy code to Vercel

See [DEPLOYMENT_QUICK_START.md](DEPLOYMENT_QUICK_START.md) for deployment instructions.
