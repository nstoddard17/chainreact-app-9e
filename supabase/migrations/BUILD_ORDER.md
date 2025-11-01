# Workspaces Table Build Order

## Summary

You have **THREE** related tables that need to exist:

1. `workspaces` - Base table for personal workspaces
2. `workspace_memberships` - Composite key membership table (**already exists**)
3. `workspace_members` - UUID key membership table (needs to be created)

---

## Current Status

### ✅ Already Exists
- **`workspace_memberships`** - Created in migration `20251028000100_flow_v2_rbac.sql`
  - Structure: (workspace_id, user_id) composite PRIMARY KEY
  - Columns: workspace_id, user_id, role, invited_by, created_at
  - Used by Flow v2 RBAC system

### ❌ Needs to be Created
- **`workspaces`** - Base table (parent of both membership tables)
  - Structure: UUID primary key
  - Columns: id, name, slug, description, owner_id, settings, avatar_url, created_at, updated_at

- **`workspace_members`** - Alternative membership table
  - Structure: UUID primary key
  - Columns: id, workspace_id, user_id, role, created_at
  - Has UNIQUE constraint on (workspace_id, user_id)

---

## Build Order (Dependency Chain)

```
1. auth.users (Supabase built-in) ✅ Already exists
   ↓
2. workspaces (must be created FIRST)
   ↓
3. workspace_memberships ✅ Already exists in migration 20251028000100_flow_v2_rbac.sql
   ↓
4. workspace_members (must be created AFTER workspaces)
```

---

## Migration Strategy

### Option A: Single Migration (Recommended)

Use the file: `COMPLETE_workspaces_and_members.sql`

This file creates:
1. ✅ `workspaces` table
2. ⏭️ Skips `workspace_memberships` (already exists)
3. ✅ `workspace_members` table

**To apply:**
```bash
# Rename to proper migration format
mv COMPLETE_workspaces_and_members.sql 20251028000200_create_workspaces_and_members.sql

# Push to Supabase
supabase db push
```

### Option B: Separate Migrations

If you want separate migrations:

```bash
# 1. Create workspaces
20251028000200_create_workspaces.sql

# 2. workspace_memberships already exists
# (in 20251028000100_flow_v2_rbac.sql)

# 3. Create workspace_members
20251028000300_create_workspace_members.sql
```

---

## Why Two Membership Tables?

You have both `workspace_memberships` and `workspace_members`:

### `workspace_memberships` (Flow v2 RBAC)
- Composite primary key (workspace_id, user_id)
- Roles: owner, editor, viewer
- Used by Flow v2 system
- Referenced by `workspace_role_at_least()` function

### `workspace_members`
- UUID primary key
- Roles: owner, admin, member, viewer
- More roles available
- Allows for additional metadata per membership

**These likely serve different purposes in your app.**

---

## Foreign Key Dependencies

Both membership tables depend on `workspaces`:

```sql
-- workspace_memberships
workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE

-- workspace_members
workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE
```

**Therefore `workspaces` MUST exist before either membership table.**

---

## Verification

After creating the tables, verify with:

```sql
-- Check if workspaces exists
SELECT COUNT(*) FROM public.workspaces;

-- Check if workspace_memberships exists
SELECT COUNT(*) FROM public.workspace_memberships;

-- Check if workspace_members exists
SELECT COUNT(*) FROM public.workspace_members;

-- Verify foreign keys
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('workspaces', 'workspace_memberships', 'workspace_members')
ORDER BY tc.table_name;
```

---

## Next Steps

1. ✅ Review `COMPLETE_workspaces_and_members.sql`
2. ✅ Rename to timestamped migration file
3. ✅ Test locally with `supabase db reset` (if using local dev)
4. ✅ Push to remote with `supabase db push`
5. ✅ Verify all three tables exist
6. ✅ Populate with existing data if needed
