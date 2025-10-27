# Organization & Team Role System Migration

**Date**: January 26, 2025
**Migrations**: `20250126180000_create_organization_members_table.sql`, `20250126180001_update_team_roles.sql`

## Overview

This migration implements a two-tier role system:
1. **Organization-level roles** - Managed in the new `organization_members` table
2. **Team-level roles** - Enhanced roles in existing `team_members` table

## Role Structure

### 🏢 Organization-Level Roles

**Table**: `organization_members`

| Role | Description | Use Case |
|------|-------------|----------|
| `owner` | Single top-level authority | Full access, billing, can delete org |
| `admin` | High-level management | Manage teams, users, settings (cannot delete org) |
| `manager` | Operational management | Day-to-day operations, view analytics |
| `hr` | People management | User onboarding/offboarding, manage invitations |
| `finance` | Billing oversight | Manage billing, view usage/costs |

**Important**: There is **no "member" role** at the organization level. Users are members of an organization either by:
- Having an org-level role (owner, admin, manager, hr, finance), OR
- Being a member of at least one team within the organization

### 👥 Team-Level Roles

**Table**: `team_members` (updated)

| Role | Description | Standalone Team Billing | Org Team Billing |
|------|-------------|------------------------|------------------|
| `owner` | Highest team authority | ✅ Full billing access | ❌ View only |
| `admin` | Team management | ✅ View billing | ❌ No access |
| `manager` | Operational oversight | ❌ No access | ❌ No access |
| `hr` | Team people management | ❌ No access | ❌ No access |
| `finance` | Financial management | ✅ Full billing access | ❌ No access* |
| `lead` | Project/functional lead | ❌ No access | ❌ No access |
| `member` | Regular contributor | ❌ No access | ❌ No access |
| `guest` | External collaborator | ❌ No access | ❌ No access |

*For teams within organizations, billing is handled at the org level by org-level finance/admin/owner roles.

## What Changed

### New Table: `organization_members`

```sql
CREATE TABLE organization_members (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner', 'admin', 'manager', 'hr', 'finance')),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(organization_id, user_id)
);
```

### Updated: `team_members` Role Constraint

**Before**:
```sql
CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
```

**After**:
```sql
CHECK (role IN ('owner', 'admin', 'manager', 'hr', 'finance', 'lead', 'member', 'guest'))
```

## Data Migration

The migration automatically:
1. ✅ Creates the `organization_members` table
2. ✅ Migrates all existing organization owners (`organizations.owner_id`) to `organization_members` with role='owner'
3. ✅ Sets up RLS policies for access control
4. ✅ Adds indexes for performance
5. ✅ Updates team_members to support new roles

## RLS Policies

### `organization_members` Policies

1. **SELECT**: Users can view org members if they belong to the org (via org-level role or team membership)
2. **INSERT**: Only org owners and admins can add new org members
3. **UPDATE**: Only org owners and admins can update member roles
4. **DELETE**: Only org owners can remove members (or users can remove themselves)

### `team_members` Policies

Existing policies remain unchanged.

## Breaking Changes

### None!

This migration is **backwards compatible**:
- Existing team roles (`owner`, `admin`, `member`) continue to work
- Existing organization data is automatically migrated
- No API changes required immediately

## Recommended Next Steps

### 1. Update TypeScript Types

```typescript
// lib/types/roles.ts
export type OrgRole = 'owner' | 'admin' | 'manager' | 'hr' | 'finance'
export type TeamRole = 'owner' | 'admin' | 'manager' | 'hr' | 'finance' | 'lead' | 'member' | 'guest'

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: OrgRole
  created_at: string
  updated_at: string
}
```

### 2. Update API Routes

Add org-level permission checks:

```typescript
// Example: /api/organizations/[id]/members/route.ts
export async function POST(req: Request, { params }: { params: { id: string } }) {
  // Check if user is org owner or admin
  const { data: orgMember } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!orgMember || !['owner', 'admin'].includes(orgMember.role)) {
    return errorResponse('Unauthorized', 403)
  }

  // Proceed with adding member...
}
```

### 3. Update Sidebar Logic

```typescript
// Check org-level roles
const { data: orgMembers } = await supabase
  .from('organization_members')
  .select('role, organization:organizations(id, name, team_count)')
  .eq('user_id', user.id)
  .in('role', ['owner', 'admin'])

const hasAdminOrg = orgMembers?.some(om =>
  om.organization.team_count > 0 // Not a workspace
) || false
```

### 4. Build Role Management UI

Create UI for:
- Assigning org-level roles to users
- Viewing org members with their roles
- Inviting users directly to organization (not just teams)

## Permission Helpers

```typescript
// lib/utils/permissions.ts

export async function hasOrgPermission(
  userId: string,
  orgId: string,
  requiredRoles: OrgRole[]
): Promise<boolean> {
  const { data } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single()

  return data ? requiredRoles.includes(data.role) : false
}

export async function hasTeamPermission(
  userId: string,
  teamId: string,
  requiredRoles: TeamRole[]
): Promise<boolean> {
  const { data } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single()

  return data ? requiredRoles.includes(data.role) : false
}

export async function canManageBilling(
  userId: string,
  teamId: string
): Promise<boolean> {
  const { data: team } = await supabase
    .from('teams')
    .select('organization_id')
    .eq('id', teamId)
    .single()

  if (!team) return false

  // Standalone team - check team-level roles
  if (!team.organization_id) {
    return hasTeamPermission(userId, teamId, ['owner', 'admin', 'finance'])
  }

  // Team in org - check org-level roles
  return hasOrgPermission(userId, team.organization_id, ['owner', 'admin', 'finance'])
}
```

## Testing

### Test Queries

```sql
-- Check all org members
SELECT
  om.*,
  o.name as org_name,
  u.email as user_email
FROM organization_members om
JOIN organizations o ON o.id = om.organization_id
JOIN auth.users u ON u.id = om.user_id;

-- Check users with both org and team roles
SELECT
  u.email,
  om.role as org_role,
  tm.role as team_role,
  t.name as team_name,
  o.name as org_name
FROM auth.users u
LEFT JOIN organization_members om ON om.user_id = u.id
LEFT JOIN organizations o ON o.id = om.organization_id
LEFT JOIN team_members tm ON tm.user_id = u.id
LEFT JOIN teams t ON t.id = tm.team_id;

-- Find all admins (org and team level)
SELECT DISTINCT
  u.email,
  'organization' as level,
  o.name as scope,
  om.role
FROM organization_members om
JOIN auth.users u ON u.id = om.user_id
JOIN organizations o ON o.id = om.organization_id
WHERE om.role IN ('owner', 'admin')

UNION

SELECT DISTINCT
  u.email,
  'team' as level,
  t.name as scope,
  tm.role
FROM team_members tm
JOIN auth.users u ON u.id = tm.user_id
JOIN teams t ON t.id = tm.team_id
WHERE tm.role IN ('owner', 'admin');
```

## Rollback

If you need to rollback:

```sql
-- Drop organization_members table
DROP TABLE IF EXISTS organization_members CASCADE;

-- Revert team_members constraint
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('owner', 'admin', 'member', 'viewer'));
```

## Questions?

See the role hierarchy design document for detailed role descriptions and use cases.
