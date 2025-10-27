# Current Database Schema

**Last Updated**: 2025-10-26
**Status**: ✅ Verified against production database

## Overview

The ChainReact database uses a **workspace-centric** model where users have personal workspaces and can optionally collaborate through teams and organizations.

## Entity Hierarchy

```
User (auth.users)
├── Workspace (personal, 1:1 with user)
│   └── Workflows (user's personal workflows)
│       └── Can be shared with → Team
│
├── Organization (optional, for enterprises)
│   ├── Team 1
│   ├── Team 2
│   └── Team N
│       └── Members (with roles)
│           └── Can access shared workflows
│
└── Standalone Teams (no organization)
    └── Members (with roles)
        └── Can access shared workflows
```

## Tables

### **workspaces**
Personal workspace for each user.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `name` | text | NO | - | Workspace name (e.g., "DaBoss's Workspace") |
| `slug` | text | NO | - | URL-safe identifier (unique) |
| `description` | text | YES | - | Optional description |
| `owner_id` | uuid | NO | - | FK to auth.users (CASCADE delete) |
| `settings` | jsonb | YES | `{}` | Workspace settings |
| `avatar_url` | text | YES | - | Workspace avatar/logo |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |

**Constraints**:
- Primary key: `id`
- Unique: `slug`
- Foreign key: `owner_id` → `auth.users(id)` ON DELETE CASCADE

**Purpose**: Every user has a personal workspace where their workflows live.

---

### **organizations**
Multi-team container for enterprise customers.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `uuid_generate_v4()` | Primary key |
| `name` | varchar(255) | NO | - | Organization name |
| `slug` | varchar(255) | YES | - | URL-safe identifier (unique) |
| `owner_id` | uuid | NO | - | FK to auth.users |
| `billing_email` | varchar(255) | YES | - | Billing contact email |
| `billing_address` | jsonb | YES | - | Billing address details |
| `description` | text | YES | - | Organization description |
| `logo_url` | text | YES | - | Organization logo |
| `settings` | jsonb | YES | `{}` | Organization settings |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |

**Constraints**:
- Primary key: `id`
- Unique: `slug`
- Foreign key: `owner_id` → `auth.users(id)`

**Purpose**: Groups multiple teams under one billing/admin entity. Organizations have a single owner, not multiple members.

**Important**: There is **NO** `organization_members` table. Organizations only have one `owner_id`.

---

### **teams**
Collaborative groups that can be standalone or part of an organization.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `organization_id` | uuid | YES | - | FK to organizations (nullable) |
| `name` | text | NO | - | Team name |
| `slug` | text | NO | - | URL-safe identifier |
| `description` | text | YES | - | Team description |
| `color` | text | YES | `#3B82F6` | Team color for UI |
| `settings` | jsonb | YES | `{}` | Team settings |
| `created_by` | uuid | NO | - | FK to auth.users (CASCADE delete) |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |

**Constraints**:
- Primary key: `id`
- Foreign key: `organization_id` → `organizations(id)` ON DELETE CASCADE
- Foreign key: `created_by` → `auth.users(id)` ON DELETE CASCADE

**Two Types**:
1. **Standalone teams**: `organization_id = NULL` - acts as a shared workspace
2. **Organization teams**: `organization_id != NULL` - part of parent organization

**Purpose**: Enable collaboration. Workflows can be shared with teams.

---

### **team_members**
User memberships in teams with roles.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `team_id` | uuid | NO | - | FK to teams (CASCADE delete) |
| `user_id` | uuid | NO | - | FK to auth.users (CASCADE delete) |
| `role` | text | YES | `'member'` | User's role in the team |
| `joined_at` | timestamptz | YES | `now()` | When user joined |

**Constraints**:
- Primary key: `id`
- Unique: `(team_id, user_id)` - one membership per user per team
- Foreign key: `team_id` → `teams(id)` ON DELETE CASCADE
- Foreign key: `user_id` → `auth.users(id)` ON DELETE CASCADE
- Check: `role IN ('owner', 'admin', 'manager', 'hr', 'finance', 'lead', 'member', 'guest')`

**Roles** (from most to least permissions):
1. **owner** - Full control of team, billing (for standalone teams)
2. **admin** - Team management, can't delete team
3. **manager** - Operational oversight
4. **hr** - People management, invitations
5. **finance** - Billing access (for standalone teams only)
6. **lead** - Project/functional leadership
7. **member** - Regular contributor
8. **guest** - External collaborator with limited access

**Purpose**: Define who has access to team resources and what they can do.

---

### **workflows**
Automation workflows created by users.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | - | FK to auth.users (workflow owner) |
| `workspace_id` | uuid | NO | - | FK to workspaces (CASCADE delete) |
| `team_id` | uuid | YES | - | FK to teams (optional, for sharing) |
| `name` | text | NO | - | Workflow name |
| `description` | text | YES | - | Workflow description |
| `nodes` | jsonb | YES | `[]` | Workflow nodes (visual builder) |
| `connections` | jsonb | YES | `[]` | Connections between nodes |
| `status` | text | YES | `'draft'` | Workflow status |
| `folder_id` | uuid | YES | - | FK to workflow_folders |
| `deleted_at` | timestamptz | YES | - | Soft delete timestamp |
| `original_folder_id` | uuid | YES | - | Original folder before trash |
| `source_template_id` | text | YES | - | Template used to create workflow |
| `created_at` | timestamptz | YES | `now()` | Creation timestamp |
| `updated_at` | timestamptz | YES | `now()` | Last update timestamp |

**Constraints**:
- Primary key: `id`
- Foreign key: `user_id` → `auth.users(id)`
- Foreign key: `workspace_id` → `workspaces(id)` ON DELETE CASCADE (REQUIRED)
- Foreign key: `team_id` → `teams(id)` ON DELETE SET NULL (optional)
- Foreign key: `folder_id` → `workflow_folders(id)` ON DELETE SET NULL
- Foreign key: `original_folder_id` → `workflow_folders(id)` ON DELETE SET NULL
- Check: `status IN ('draft', 'active', 'inactive')`

**Ownership Model**:
- Every workflow **MUST** belong to a workspace (`workspace_id` NOT NULL)
- Workflows are **owned** by a user (`user_id`)
- Workflows can be **shared** with a team (`team_id` nullable)

**Trash System**:
- `deleted_at`: When workflow was moved to trash
- `original_folder_id`: Original folder to restore to
- Workflows are soft-deleted (can be restored within 7 days)

**Purpose**: Store automation workflows. Personal by default, optionally shared with teams.

---

## Workflow Visibility & Access

### Personal Workflows
- `workspace_id` set, `team_id = NULL`
- Only the owner can see/edit
- Lives in user's personal workspace

### Team-Shared Workflows
- `workspace_id` set (owner's workspace), `team_id` set
- Owner retains ownership
- All team members can access based on team role permissions

### Organization Context
- Workflows shared with teams that belong to an organization
- Organization members access via team membership
- No direct organization → workflow relationship

## Key Design Principles

1. ✅ **Workspace-centric**: All workflows belong to a workspace (personal)
2. ✅ **Ownership clarity**: Workflows have one owner (user), one home (workspace)
3. ✅ **Optional collaboration**: Teams enable sharing, not required
4. ✅ **Flexible teams**: Can be standalone or part of organization
5. ✅ **Single organization owner**: Organizations have `owner_id`, no members table
6. ✅ **Granular team roles**: 8 role types for fine-grained permissions

## What Does NOT Exist

❌ **organization_members table** - Organizations only have `owner_id`
❌ **Direct org → workflow relationship** - Workflows belong to workspaces, shared via teams
❌ **Organization-level roles** - Only team-level roles exist

## Migration History

- Original schema used organizations as primary entity
- Migrated to workspace-centric model
- Organizations became optional grouping mechanism for teams
- Team roles expanded from 4 to 8 types (January 2025)
- `organization_members` table was planned but never implemented

## Common Queries

### Get user's workspaces
```sql
SELECT * FROM workspaces WHERE owner_id = $user_id;
```

### Get user's teams
```sql
SELECT t.*, tm.role
FROM teams t
JOIN team_members tm ON tm.team_id = t.id
WHERE tm.user_id = $user_id;
```

### Get workflows visible to user
```sql
-- Personal workflows
SELECT * FROM workflows
WHERE user_id = $user_id;

-- Team-shared workflows (where user is team member)
SELECT DISTINCT w.*
FROM workflows w
JOIN team_members tm ON tm.team_id = w.team_id
WHERE tm.user_id = $user_id;
```

### Check if user can manage team
```sql
SELECT EXISTS (
  SELECT 1 FROM team_members
  WHERE team_id = $team_id
  AND user_id = $user_id
  AND role IN ('owner', 'admin')
);
```
