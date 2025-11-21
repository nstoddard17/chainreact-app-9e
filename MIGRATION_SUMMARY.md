# Workflow Table Migration Summary

## Overview
This migration renames all V2 tables to use clean `workflows_*` naming and sets up proper workflow sharing functionality.

## What Gets Changed

### Tables Dropped (Legacy - No Longer Needed)
- ❌ `workflows` (old legacy table)
- ❌ `workflow_executions` (old legacy table)

### Tables Renamed (V2 → New Clean Names)
| Old Name (V2) | New Name | Purpose |
|---------------|----------|---------|
| `flow_v2_definitions` | **`workflows`** | Main workflow metadata |
| `flow_v2_revisions` | **`workflows_revisions`** | Version history |
| `flow_v2_runs` | **`workflows_runs`** | Execution runs |
| `flow_v2_run_nodes` | **`workflows_run_nodes`** | Node execution results |
| `flow_v2_lineage` | **`workflows_lineage`** | Data flow tracking |
| `flow_v2_templates` | **`workflows_templates`** | Workflow templates |
| `flow_v2_schedules` | **`workflows_schedules`** | Cron schedules |
| `flow_v2_published_revisions` | **`workflows_published_revisions`** | Published versions |
| `flow_v2_node_logs` | **`workflows_node_logs`** | Node execution logs |

### Tables Preserved/Created
- ✅ **`workflow_permissions`** - Per-workflow sharing (created/updated)
- ✅ **`workflow_folders`** - Folder organization (kept as-is)

### Column Renames
- `flow_id` → **`workflow_id`** (in all related tables)

## Workflow Sharing Feature

The `workflow_permissions` table enables sharing specific workflows with specific users:

### Permission Levels
- **`view`** - Can see and run the workflow
- **`edit`** - Can modify the workflow
- **`admin`** - Can modify workflow AND manage sharing

### Example Usage

**Share a workflow:**
```sql
INSERT INTO workflow_permissions (workflow_id, user_id, permission, granted_by)
VALUES ('workflow-uuid', 'user-uuid', 'edit', auth.uid());
```

**Get workflows shared with me:**
```sql
SELECT w.* FROM workflows w
INNER JOIN workflow_permissions wp ON w.id = wp.workflow_id
WHERE wp.user_id = auth.uid();
```

**See who has access to my workflow:**
```sql
SELECT u.email, wp.permission, wp.granted_at
FROM workflow_permissions wp
JOIN auth.users u ON wp.user_id = u.id
WHERE wp.workflow_id = 'workflow-uuid';
```

### RLS Security
- ✅ Users can only grant permissions for workflows they own
- ✅ Users automatically see workflows shared with them
- ✅ Edit/admin permissions allow workflow modifications
- ✅ Service role has full access for system operations

## Code Changes Required

After running the migration SQL, update your codebase:

### 1. Find and Replace
```bash
# Table names
flow_v2_definitions → workflows
flow_v2_runs → workflows_runs
flow_v2_run_nodes → workflows_run_nodes
flow_v2_revisions → workflows_revisions
flow_v2_lineage → workflows_lineage
flow_v2_templates → workflows_templates
flow_v2_schedules → workflows_schedules

# Column names
flow_id → workflow_id
```

### 2. Key Files to Update
- `/app/workflows/v2/api/**/*` - All V2 API endpoints
- `/src/lib/workflows/builder/**/*` - Builder logic
- `/app/api/workflows/route.ts` - Workflows list
- Any component that queries these tables

### 3. TypeScript Types
Update interfaces and types to match new naming:
- Consider renaming `Flow` type to `Workflow`
- Update field references: `flow_id` → `workflow_id`

## Testing Checklist

After migration, test:
- [ ] Workflow creation
- [ ] Workflow execution
- [ ] Node results display
- [ ] Version history
- [ ] Folder organization
- [ ] **Workflow sharing (new)**
  - [ ] Share workflow with user
  - [ ] Verify recipient can view/edit
  - [ ] Revoke access
  - [ ] Check permission levels

## Running the Migration

**Option 1: Using psql**
```bash
psql "your-connection-string" -f MIGRATION_RENAME_TABLES.sql
```

**Option 2: Supabase Dashboard**
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `MIGRATION_RENAME_TABLES.sql`
3. Execute

**Time estimate:** 2-5 minutes

**Safety:** Wrapped in transaction - rolls back if any step fails

## Rollback Plan

If something goes wrong, the transaction will auto-rollback. If you need to manually rollback after commit:

1. Backup your database first
2. Reverse the table renames
3. Recreate legacy tables from backup

**Better approach:** Test in staging environment first!
