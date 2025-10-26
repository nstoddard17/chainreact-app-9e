# Workspace Migration Guide

**Created**: January 26, 2025
**Status**: Ready for execution
**Author**: Claude

## Overview

This migration restructures the database to support the proper hierarchy:
- **Personal Workspaces** (one per user)
- **Standalone Teams** (optional, shared workspace)
- **Organizations → Teams → Members** (proper hierarchy)

## Migration Files

Execute these in order:

1. `20250126000001_workspace_migration_step1_create_tables.sql`
2. `20250126000002_workspace_migration_step2_migrate_personal_workspaces.sql`
3. `20250126000003_workspace_migration_step3_handle_organizations.sql`
4. `20250126000004_workspace_migration_step4_update_teams.sql`
5. `20250126000005_workspace_migration_step5_update_workflows.sql`
6. `20250126000006_workspace_migration_step6_cleanup.sql` ⚠️ **BREAKING**

## Migration Steps

### Steps 1-5: Non-Breaking (Safe to Run)

These steps are **additive only** and won't break existing functionality:

```bash
# Step 1: Create new tables
supabase migration up 20250126000001

# Step 2: Migrate personal workspaces
supabase migration up 20250126000002

# Step 3: Handle organizations
supabase migration up 20250126000003

# Step 4: Update teams structure
supabase migration up 20250126000004

# Step 5: Update workflows and RLS
supabase migration up 20250126000005
```

**After Steps 1-5**:
- Both old and new schema exist
- Data is duplicated in both locations
- Old code still works
- New code can start being developed

### Step 6: Cleanup (BREAKING)

⚠️ **DO NOT RUN UNTIL**:
1. All API routes updated
2. All UI components updated
3. Testing complete
4. Database backed up

```bash
# Step 6: Cleanup old schema (BREAKING)
supabase migration up 20250126000006
```

**What Step 6 Does**:
- Deletes `organization_members` table
- Removes `is_personal` column from organizations
- Removes `organization_id` from workflows
- Deletes personal organizations (data is in workspaces)

## Schema Changes Summary

### New Tables
- `workspaces` - Personal workspaces only
- `workspace_members` - Members of workspaces

### Modified Tables
- `organizations` - Remove `is_personal`, keep real orgs only
- `teams` - Add `workspace_id` for standalone teams
- `workflows` - Replace `organization_id` with `workspace_id`
- `workflow_executions` - Add `workspace_id`

### Deleted Tables
- `organization_members` - Replaced by team_members

## Verification After Each Step

### After Step 1
```sql
-- Check new tables exist
SELECT * FROM workspaces LIMIT 1;
SELECT * FROM workspace_members LIMIT 1;

-- Check columns added
SELECT workspace_id FROM teams LIMIT 1;
SELECT workspace_id FROM workflows LIMIT 1;
```

### After Step 2
```sql
-- Count personal workspaces created
SELECT COUNT(*) FROM workspaces;

-- Should match personal org count
SELECT COUNT(*) FROM organizations WHERE is_personal = true;

-- Check workspace owners
SELECT w.name, w.owner_id, wm.role
FROM workspaces w
JOIN workspace_members wm ON w.id = wm.workspace_id AND w.owner_id = wm.user_id;
```

### After Step 3
```sql
-- Check all orgs have at least one team
SELECT o.name, COUNT(t.id) as team_count
FROM organizations o
LEFT JOIN teams t ON t.organization_id = o.id
WHERE o.is_personal = false OR o.is_personal IS NULL
GROUP BY o.id, o.name;

-- Check all org owners are in a team
SELECT o.name, o.owner_id,
       EXISTS(
         SELECT 1 FROM teams t
         JOIN team_members tm ON t.id = tm.team_id
         WHERE t.organization_id = o.id AND tm.user_id = o.owner_id
       ) as owner_in_team
FROM organizations o
WHERE o.is_personal = false OR o.is_personal IS NULL;

-- Check organization_members migration
SELECT COUNT(*) as unmigrated_members
FROM organization_members om
WHERE NOT EXISTS (
  SELECT 1 FROM teams t
  JOIN team_members tm ON t.id = tm.team_id
  WHERE t.organization_id = om.organization_id AND tm.user_id = om.user_id
);
```

### After Step 4
```sql
-- Test constraint (should fail)
INSERT INTO teams (name, slug) VALUES ('Test', 'test');

-- Test constraint (should succeed if you have an org)
-- INSERT INTO teams (name, slug, organization_id) VALUES ('Test', 'test', '<org-id>');

-- Check team types
SELECT
  COUNT(*) FILTER (WHERE organization_id IS NOT NULL) as org_teams,
  COUNT(*) FILTER (WHERE workspace_id IS NOT NULL) as standalone_teams
FROM teams;
```

### After Step 5
```sql
-- Check all workflows have workspace_id
SELECT
  COUNT(*) FILTER (WHERE workspace_id IS NOT NULL) as with_workspace,
  COUNT(*) FILTER (WHERE workspace_id IS NULL) as without_workspace
FROM workflows;

-- Test helper functions
SELECT * FROM get_user_workspaces(auth.uid());
SELECT * FROM get_user_teams(auth.uid());
SELECT can_access_workspace('<workspace-id>', auth.uid());
```

### After Step 6 (Cleanup)
```sql
-- Verify personal orgs deleted
SELECT COUNT(*) FROM organizations WHERE is_personal = true;
-- Should error: column "is_personal" does not exist

-- Verify organization_members deleted
SELECT COUNT(*) FROM organization_members;
-- Should error: relation "organization_members" does not exist

-- Verify workflows no longer have organization_id
SELECT organization_id FROM workflows LIMIT 1;
-- Should error: column "organization_id" does not exist

-- Check all workflows have workspace_id
SELECT COUNT(*) as missing_workspace FROM workflows WHERE workspace_id IS NULL;
-- Should be 0

-- Test user context function
SELECT get_user_context(auth.uid());
```

## Rollback Strategy

### Before Step 6 (Non-Breaking Phase)
You can safely rollback by:
1. Dropping new tables: `DROP TABLE workspaces, workspace_members CASCADE;`
2. Removing new columns: `ALTER TABLE teams DROP COLUMN workspace_id;`
3. Old code continues to work

### After Step 6 (Breaking Phase)
**Cannot rollback without data loss!**

To rollback:
1. Restore database from backup taken before Step 6
2. Revert code changes via git
3. Re-run Steps 1-5 if needed

## Testing Checklist

Before running Step 6, verify:

- [ ] All personal orgs have corresponding workspace entries
- [ ] All workspace owners are in workspace_members
- [ ] All organization owners are in at least one team
- [ ] All organization_members have been migrated to teams
- [ ] All workflows have workspace_id populated
- [ ] Helper functions work correctly
- [ ] RLS policies allow proper access
- [ ] API routes updated and tested
- [ ] UI components updated and tested
- [ ] Full backup created

## API Routes That Need Updates

See [workspace-migration-breaking-changes.md](../../learning/docs/workspace-migration-breaking-changes.md) for complete list.

**Critical routes**:
- `/api/organizations/[id]/members/` - Rewrite for team-based membership
- `/api/organizations/[id]/invitations/` - Update for team invites
- `/api/workflows/[id]/move-to-organization/` - Rename to move-to-workspace

## UI Components That Need Updates

**Major rewrites**:
- `OrganizationSettingsContent.tsx` - Team-based member management
- `OrganizationSwitcher.tsx` - Workspace switcher
- `MemberManagement.tsx` - Team membership
- `CreateOrganizationDialog.tsx` - Create workspace + org + team
- `AddToOrganizationDialog.tsx` - Workspace dialog

## Post-Migration Tasks

After successful migration:

1. **Monitor Errors**
   - Check application logs for workspace-related errors
   - Monitor Sentry/error tracking

2. **Verify Data Integrity**
   - Run all verification queries
   - Check user access to workflows
   - Verify team memberships

3. **Update Documentation**
   - Update API docs
   - Update user guides
   - Update developer docs

4. **Communicate Changes**
   - Notify users of new workspace features
   - Update help center articles

5. **Performance Monitoring**
   - Monitor query performance
   - Check for slow queries
   - Optimize indexes if needed

## New Features Enabled

After migration, you can:

1. **Personal Workspaces**
   - Every user has their own workspace automatically
   - Cleaner separation from organizations

2. **Standalone Teams**
   - Create teams without an organization
   - Useful for small groups/projects

3. **Proper Organization Hierarchy**
   - Organizations → Teams → Members
   - No more direct org membership confusion

4. **Better Access Control**
   - Clear workspace/team/org boundaries
   - RLS policies match business logic

## Support

If you encounter issues:

1. Check the verification queries for each step
2. Review [workspace-migration-breaking-changes.md](../../learning/docs/workspace-migration-breaking-changes.md)
3. Check application logs
4. Review database logs
5. If stuck, restore from backup and investigate

## Timeline Estimate

- **Steps 1-5**: 30 minutes (can run incrementally)
- **Testing**: 2-3 hours
- **Code Updates**: 15-20 days (API + UI)
- **Step 6**: 5 minutes (after code updated)
- **Post-migration verification**: 1-2 hours

**Total**: 15-23 days including development

---

**Last Updated**: January 26, 2025
