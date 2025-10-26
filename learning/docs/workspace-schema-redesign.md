# Workspace Schema Redesign

**Date**: January 26, 2025
**Status**: Design Phase
**Author**: Claude

## Overview

Complete restructuring of the workspace hierarchy to support:
- Personal workspaces (one per user, default)
- Standalone teams (shared workspace without organization)
- Organizations → Teams → Members hierarchy

## Current Problems

1. **Organizations table misused**: Personal workspaces stored with `is_personal=true` flag
2. **No dedicated workspaces concept**: Everything forced into organizations
3. **Confusing hierarchy**: Organizations can have direct members OR teams
4. **Inconsistent data model**: `organization_members` bypasses team structure

## Proposed New Schema

### 1. **`workspaces`** (NEW - Core Table)
Central table for all workspace types.

```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal', 'team', 'organization')),
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB DEFAULT '{}',
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Types**:
- `personal`: One per user, auto-created on signup
- `team`: Standalone team workspace (no organization)
- `organization`: Organization workspace (contains multiple teams)

### 2. **`organizations`** (MODIFIED)
Organization-specific settings only. References workspace.

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID UNIQUE NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  billing_email TEXT,
  billing_address JSONB,
  subscription_id TEXT, -- Stripe subscription ID
  plan_id UUID REFERENCES plans(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. **`teams`** (MODIFIED)
Teams can belong to organization OR be standalone.

```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE, -- For standalone teams
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- For org teams
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: Team must be either standalone (workspace_id) OR in org (organization_id), not both
  CONSTRAINT team_type_check CHECK (
    (workspace_id IS NOT NULL AND organization_id IS NULL) OR
    (workspace_id IS NULL AND organization_id IS NOT NULL)
  ),

  -- Unique slug within organization OR globally for standalone
  UNIQUE NULLS NOT DISTINCT (organization_id, slug)
);
```

### 4. **`team_members`** (KEEP - No Changes)
Users in teams (unchanged).

```sql
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);
```

### 5. **`workspace_members`** (NEW)
Direct access to workspaces (for personal/team workspaces only).

```sql
CREATE TABLE workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);
```

### 6. **DELETE `organization_members`**
This table is removed. Organization membership determined by team membership.

### 7. **`workflows`** (MODIFIED)
Add workspace_id, keep team_id for team-specific workflows.

```sql
ALTER TABLE workflows
  ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  DROP COLUMN organization_id; -- Remove old reference

-- Workflows belong to a workspace, optionally scoped to a team
CREATE INDEX idx_workflows_workspace_id ON workflows(workspace_id);
CREATE INDEX idx_workflows_team_id ON workflows(team_id);
```

## Hierarchy Examples

### Personal Workspace
```
Workspace (type=personal, owner=user1)
└── user1 (owner via workspace_members)
    └── workflows owned by user1
```

### Standalone Team
```
Workspace (type=team, owner=user1)
└── Team
    ├── user1 (admin via team_members)
    ├── user2 (member via team_members)
    └── team workflows
```

### Organization
```
Workspace (type=organization, owner=user1)
└── Organization
    ├── Team A
    │   ├── user1 (admin)
    │   ├── user2 (member)
    │   └── Team A workflows
    └── Team B
        ├── user3 (admin)
        ├── user4 (member)
        └── Team B workflows
```

## Access Control Logic

### Workspace Access
User has access to workspace IF:
- **Personal**: User is owner (workspace_members.role = 'owner')
- **Team**: User is in workspace_members OR in the team's team_members
- **Organization**: User is in ANY team within the organization

### Workflow Access
User can view workflow IF:
- Workflow.user_id = user (personal workflow)
- User has access to workflow.workspace_id
- If workflow.team_id is set: User is in that team

### Organization Admin
User is org admin IF:
- User is workspace owner (workspace_members.role = 'owner')
- OR user has 'admin' role in workspace_members for that org's workspace

## Data Migration Plan

### Phase 1: Create New Tables
1. Create `workspaces` table
2. Create `workspace_members` table
3. Modify `teams` table (add workspace_id)
4. Modify `organizations` table (add workspace_id)

### Phase 2: Migrate Existing Data

**Personal Workspaces (is_personal=true)**:
```sql
-- For each personal org, create workspace
INSERT INTO workspaces (name, slug, type, owner_id, description, settings)
SELECT name, slug, 'personal', owner_id, description, settings
FROM organizations WHERE is_personal = true;

-- Create workspace_members entries
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, o.owner_id, 'owner'
FROM organizations o
JOIN workspaces w ON w.slug = o.slug
WHERE o.is_personal = true;

-- Update workflows to reference workspace
UPDATE workflows wf
SET workspace_id = w.id
FROM organizations o
JOIN workspaces w ON w.slug = o.slug
WHERE wf.organization_id = o.id AND o.is_personal = true;
```

**Regular Organizations (is_personal=false)**:
```sql
-- Create workspace for each organization
INSERT INTO workspaces (name, slug, type, owner_id, description, logo_url, settings)
SELECT name, slug, 'organization', owner_id, description, logo_url, settings
FROM organizations WHERE is_personal = false OR is_personal IS NULL;

-- Link organizations to workspaces
UPDATE organizations o
SET workspace_id = w.id
FROM workspaces w
WHERE w.slug = o.slug AND (o.is_personal = false OR o.is_personal IS NULL);

-- Create workspace_members for org owners
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT w.id, o.owner_id, 'owner'
FROM organizations o
JOIN workspaces w ON w.id = o.workspace_id
WHERE o.is_personal = false OR o.is_personal IS NULL;
```

**Teams**:
```sql
-- For teams in organizations (keep organization_id)
-- No change needed, they already have organization_id

-- For standalone teams (if any exist in future)
-- They will have workspace_id instead
```

**Migrate organization_members to team_members**:
```sql
-- Create a default team for each organization if members exist outside teams
-- This ensures no one loses access
```

### Phase 3: Update References
1. Update all tables with `organization_id` to use `workspace_id` where appropriate
2. Update RLS policies
3. Update API routes
4. Update UI components

### Phase 4: Cleanup
1. Drop `organization_members` table
2. Remove `is_personal` column from organizations
3. Remove `organization_id` from workflows (replaced by workspace_id)

## Tables Affected (Need Updates)

Tables with `organization_id` that need evaluation:
- `workflows` → Change to `workspace_id`
- `advanced_integrations` → Change to `workspace_id`
- `ai_workflow_generations` → Change to `workspace_id`
- `analytics_metrics` → Change to `workspace_id`
- `api_keys` → Change to `workspace_id`
- `api_usage_logs` → Change to `workspace_id`
- `audit_logs` → Change to `workspace_id`
- ~40+ more tables (see full list in types/database.types.ts)

## Benefits

1. **Clear Hierarchy**: Workspace → (Organization) → Team → Members
2. **Flexible**: Supports personal, team, and organization workspaces
3. **Consistent**: All workspace types follow same pattern
4. **Scalable**: Easy to add new workspace features
5. **No Confusion**: Personal workspaces are no longer "fake organizations"

## Risks & Considerations

1. **Large Migration**: Many tables reference `organization_id`
2. **Downtime**: May require maintenance window for migration
3. **Code Changes**: Significant updates to API routes and UI
4. **Data Integrity**: Must ensure no data loss during migration
5. **Rollback Plan**: Need ability to revert if issues arise

## Next Steps

1. ✅ Get approval on schema design
2. Create detailed migration scripts with rollback capability
3. Test migration on staging environment
4. Update API routes incrementally
5. Update UI components
6. Deploy with monitoring
