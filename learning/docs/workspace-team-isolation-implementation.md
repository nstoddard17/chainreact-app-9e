# Workspace & Team Isolation Implementation Guide

**Created:** 2025-10-27
**Status:** In Progress
**Goal:** Implement Model C workspace architecture with team-based data isolation

---

## 🎯 Vision & Goals

### What We're Building
A multi-tenant workspace system where:
- **Personal Workspaces** - Every user has private workspace for personal automations
- **Organization Workspaces** - Business/Enterprise customers get organizations with multiple teams
- **Team Isolation** - Workflows belong to teams, only team members see team workflows
- **Flexible Collaboration** - Teams can share workflows org-wide when needed

### Success Criteria
✅ Users can switch between Personal, Organization, and Team contexts
✅ Workflows are isolated by team (team members only)
✅ Organization-wide workflows visible to all teams
✅ Clean UI with team badges showing ownership
✅ Proper RLS policies enforce access control
✅ Billing works at personal OR organization level

---

## 📋 Prerequisites

### Database Schema Changes (COMPLETED)
✅ `workflows.team_id` - UUID FK to teams
✅ `workflows.visibility` - ENUM ('private', 'team', 'organization', 'public')
✅ `workflow_folders.team_id` - UUID FK to teams

### Existing Tables (NO CHANGES NEEDED)
- `workspaces` - Personal workspace per user
- `organizations` - Billing entity with owner_id
- `teams` - Can be standalone OR part of organization
- `team_members` - Role-based membership

---

## 🏗️ Architecture Overview

### Data Model Relationships

```
User
├── Personal Workspace (workspaces table)
│   └── Personal Workflows
│       ├── organization_id = NULL
│       ├── team_id = NULL
│       └── visibility = 'private'
│
├── Organization (Business/Enterprise)
│   ├── owner_id: User
│   ├── Teams[]
│   │   ├── Team A
│   │   │   ├── team_members[] (role-based)
│   │   │   ├── Folders (team_id = teamA.id)
│   │   │   └── Workflows
│   │   │       ├── organization_id = org.id
│   │   │       ├── team_id = teamA.id
│   │   │       └── visibility = 'team' (only Team A sees)
│   │   └── Team B
│   │       └── Workflows (team_id = teamB.id)
│   └── Shared Workflows
│       ├── organization_id = org.id
│       ├── team_id = NULL
│       └── visibility = 'organization' (all teams see)
│
└── Standalone Team (no organization)
    ├── Workflows
    │   ├── organization_id = NULL
    │   ├── team_id = team.id
    │   └── visibility = 'team'
```

### Visibility Rules

| Visibility | organization_id | team_id | Who Can See |
|------------|----------------|---------|-------------|
| `private` | NULL or org.id | NULL or team.id | Only creator |
| `team` | org.id or NULL | team.id (required) | Team members only |
| `organization` | org.id (required) | NULL or team.id | All org members |
| `public` | Any | Any | Everyone (workflow store - future) |

### Access Control Logic

```typescript
function canUserAccessWorkflow(workflow, user) {
  // 1. Private workflows - only creator
  if (workflow.visibility === 'private') {
    return workflow.user_id === user.id
  }

  // 2. Team workflows - must be team member
  if (workflow.visibility === 'team' && workflow.team_id) {
    return isUserInTeam(user.id, workflow.team_id)
  }

  // 3. Organization workflows - must be in any team in org
  if (workflow.visibility === 'organization' && workflow.organization_id) {
    return isUserInOrganization(user.id, workflow.organization_id)
  }

  // 4. Public workflows - everyone (future)
  if (workflow.visibility === 'public') {
    return true
  }

  return false
}
```

---

## 📝 Implementation Checklist

### Phase 1: Database & Backend Foundation
- [ ] 1.1 - Update RLS policies for team-based access
- [ ] 1.2 - Create database helper functions
- [ ] 1.3 - Add billing columns to organizations table
- [ ] 1.4 - Update workflow API routes for team filtering
- [ ] 1.5 - Update folder API routes for team filtering
- [ ] 1.6 - Create team context utilities

### Phase 2: Core Business Logic
- [ ] 2.1 - Create team permission service
- [ ] 2.2 - Create workspace context manager
- [ ] 2.3 - Update workflow execution service for team context
- [ ] 2.4 - Create workflow visibility validators
- [ ] 2.5 - Update integration scoping (optional - future enhancement)

### Phase 3: Frontend State Management
- [ ] 3.1 - Update workflowStore for team filtering
- [ ] 3.2 - Create teamStore for team state
- [ ] 3.3 - Update organizationStore for team queries
- [ ] 3.4 - Create workspace context provider
- [ ] 3.5 - Update authStore to track current workspace

### Phase 4: UI Components
- [ ] 4.1 - Update OrganizationSwitcher with team info
- [ ] 4.2 - Create TeamBadge component
- [ ] 4.3 - Create TeamFilter component
- [ ] 4.4 - Update WorkflowCard with team badges
- [ ] 4.5 - Update workflow creation modal with visibility selector
- [ ] 4.6 - Update folder UI with team badges
- [ ] 4.7 - Add team selector to workflow builder

### Phase 5: Billing Integration
- [ ] 5.1 - Update billing store for organization billing
- [ ] 5.2 - Create organization task usage tracking
- [ ] 5.3 - Update task limit checks for org context
- [ ] 5.4 - Add organization billing page
- [ ] 5.5 - Update sidebar task widget for org context

### Phase 6: Testing & Documentation
- [ ] 6.1 - Test personal workspace workflows
- [ ] 6.2 - Test standalone team workflows
- [ ] 6.3 - Test organization with multiple teams
- [ ] 6.4 - Test team isolation (users can't see other teams)
- [ ] 6.5 - Test organization-wide sharing
- [ ] 6.6 - Update user documentation
- [ ] 6.7 - Create migration guide for existing users

---

## 🔨 Detailed Implementation Steps

---

## Phase 1: Database & Backend Foundation

### 1.1 - Update RLS Policies for Team-Based Access

**File:** `/supabase/migrations/[timestamp]_add_team_isolation_rls.sql`

**Objectives:**
- Update workflows RLS to respect team membership
- Update folders RLS to respect team membership
- Ensure users can only see workflows they have access to

**Implementation:**

```sql
-- ================================================================
-- WORKFLOWS RLS POLICIES - Team-Based Access Control
-- ================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can insert own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can update own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can delete own workflows" ON public.workflows;

-- SELECT: Users can view workflows they have access to
CREATE POLICY "Users can view accessible workflows"
  ON public.workflows FOR SELECT
  USING (
    -- 1. Personal workflows (no organization, no team)
    (organization_id IS NULL AND team_id IS NULL AND user_id = auth.uid())
    OR
    -- 2. Private workflows they created
    (visibility = 'private' AND user_id = auth.uid())
    OR
    -- 3. Team workflows where user is team member
    (
      visibility = 'team'
      AND team_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = workflows.team_id
        AND team_members.user_id = auth.uid()
      )
    )
    OR
    -- 4. Organization workflows where user is in any team in org
    (
      visibility = 'organization'
      AND organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM teams
        INNER JOIN team_members ON teams.id = team_members.team_id
        WHERE teams.organization_id = workflows.organization_id
        AND team_members.user_id = auth.uid()
      )
    )
    OR
    -- 5. Public workflows (future - workflow store)
    (visibility = 'public')
  );

-- INSERT: Users can create workflows
CREATE POLICY "Users can create workflows"
  ON public.workflows FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND
    -- If team_id specified, user must be member of that team
    (
      team_id IS NULL
      OR
      EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = workflows.team_id
        AND team_members.user_id = auth.uid()
      )
    )
    AND
    -- If organization_id specified, user must be in organization
    (
      organization_id IS NULL
      OR
      EXISTS (
        SELECT 1 FROM teams
        INNER JOIN team_members ON teams.id = team_members.team_id
        WHERE teams.organization_id = workflows.organization_id
        AND team_members.user_id = auth.uid()
      )
    )
  );

-- UPDATE: Users can update workflows they have access to
CREATE POLICY "Users can update accessible workflows"
  ON public.workflows FOR UPDATE
  USING (
    -- Owner can always update
    user_id = auth.uid()
    OR
    -- Team admin/manager can update team workflows
    (
      team_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = workflows.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner', 'admin', 'manager')
      )
    )
  )
  WITH CHECK (
    -- Same validation as INSERT
    auth.uid() = user_id
    AND
    (
      team_id IS NULL
      OR
      EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = workflows.team_id
        AND team_members.user_id = auth.uid()
      )
    )
  );

-- DELETE: Users can delete workflows they own or team admins can delete team workflows
CREATE POLICY "Users can delete workflows"
  ON public.workflows FOR DELETE
  USING (
    -- Owner can delete
    user_id = auth.uid()
    OR
    -- Team owner/admin can delete team workflows
    (
      team_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = workflows.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner', 'admin')
      )
    )
  );

-- ================================================================
-- WORKFLOW FOLDERS RLS POLICIES - Team-Based Access Control
-- ================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own folders" ON public.workflow_folders;
DROP POLICY IF EXISTS "Users can insert own folders" ON public.workflow_folders;
DROP POLICY IF EXISTS "Users can update own folders" ON public.workflow_folders;
DROP POLICY IF EXISTS "Users can delete own folders" ON public.workflow_folders;

-- SELECT: Users can view folders they have access to
CREATE POLICY "Users can view accessible folders"
  ON public.workflow_folders FOR SELECT
  USING (
    -- 1. Personal folders (no organization, no team)
    (organization_id IS NULL AND team_id IS NULL AND user_id = auth.uid())
    OR
    -- 2. Team folders where user is team member
    (
      team_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = workflow_folders.team_id
        AND team_members.user_id = auth.uid()
      )
    )
    OR
    -- 3. Organization folders where user is in any team in org
    (
      organization_id IS NOT NULL
      AND team_id IS NULL
      AND EXISTS (
        SELECT 1 FROM teams
        INNER JOIN team_members ON teams.id = team_members.team_id
        WHERE teams.organization_id = workflow_folders.organization_id
        AND team_members.user_id = auth.uid()
      )
    )
  );

-- INSERT: Users can create folders
CREATE POLICY "Users can create folders"
  ON public.workflow_folders FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND
    -- If team_id specified, user must be member
    (
      team_id IS NULL
      OR
      EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = workflow_folders.team_id
        AND team_members.user_id = auth.uid()
      )
    )
  );

-- UPDATE: Users can update their folders or team admins can update team folders
CREATE POLICY "Users can update accessible folders"
  ON public.workflow_folders FOR UPDATE
  USING (
    user_id = auth.uid()
    OR
    (
      team_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = workflow_folders.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner', 'admin', 'manager')
      )
    )
  );

-- DELETE: Users can delete their folders or team admins can delete team folders
CREATE POLICY "Users can delete folders"
  ON public.workflow_folders FOR DELETE
  USING (
    user_id = auth.uid()
    OR
    (
      team_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = workflow_folders.team_id
        AND team_members.user_id = auth.uid()
        AND team_members.role IN ('owner', 'admin')
      )
    )
  );

-- ================================================================
-- INDEXES FOR PERFORMANCE
-- ================================================================

-- Already exist from previous migrations, but verify:
-- CREATE INDEX IF NOT EXISTS idx_workflows_team_id ON public.workflows(team_id);
-- CREATE INDEX IF NOT EXISTS idx_workflows_visibility ON public.workflows(visibility);
-- CREATE INDEX IF NOT EXISTS idx_workflow_folders_team_id ON public.workflow_folders(team_id);

-- Additional composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workflows_team_visibility
  ON public.workflows(team_id, visibility)
  WHERE team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflows_org_visibility
  ON public.workflows(organization_id, visibility)
  WHERE organization_id IS NOT NULL;
```

**Testing:**
```sql
-- Test 1: Personal workflow (no org, no team)
INSERT INTO workflows (name, user_id, visibility)
VALUES ('My Personal Workflow', auth.uid(), 'private');

-- Test 2: Team workflow (user must be in team)
INSERT INTO workflows (name, user_id, team_id, visibility)
VALUES ('Team Workflow', auth.uid(), 'team-uuid', 'team');
-- Should fail if user not in team-uuid

-- Test 3: Organization workflow
INSERT INTO workflows (name, user_id, organization_id, visibility)
VALUES ('Org Workflow', auth.uid(), 'org-uuid', 'organization');
-- Should fail if user not in any team in org-uuid
```

---

### 1.2 - Create Database Helper Functions

**File:** `/supabase/migrations/[timestamp]_add_team_helper_functions.sql`

**Objectives:**
- Create reusable SQL functions for common team queries
- Improve performance with optimized queries
- Simplify application code

**Implementation:**

```sql
-- ================================================================
-- HELPER FUNCTION: Check if user is in team
-- ================================================================
CREATE OR REPLACE FUNCTION is_user_in_team(
  p_user_id UUID,
  p_team_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_members.user_id = p_user_id
    AND team_members.team_id = p_team_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ================================================================
-- HELPER FUNCTION: Check if user is in organization
-- ================================================================
CREATE OR REPLACE FUNCTION is_user_in_organization(
  p_user_id UUID,
  p_organization_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM teams
    INNER JOIN team_members ON teams.id = team_members.team_id
    WHERE teams.organization_id = p_organization_id
    AND team_members.user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ================================================================
-- HELPER FUNCTION: Get user's teams in organization
-- ================================================================
CREATE OR REPLACE FUNCTION get_user_teams_in_org(
  p_user_id UUID,
  p_organization_id UUID
)
RETURNS TABLE (
  team_id UUID,
  team_name TEXT,
  team_slug TEXT,
  team_color TEXT,
  user_role TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    teams.id,
    teams.name,
    teams.slug,
    teams.color,
    team_members.role
  FROM teams
  INNER JOIN team_members ON teams.id = team_members.team_id
  WHERE teams.organization_id = p_organization_id
  AND team_members.user_id = p_user_id
  ORDER BY teams.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ================================================================
-- HELPER FUNCTION: Get user's role in team
-- ================================================================
CREATE OR REPLACE FUNCTION get_user_team_role(
  p_user_id UUID,
  p_team_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM team_members
  WHERE user_id = p_user_id
  AND team_id = p_team_id;

  RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ================================================================
-- HELPER FUNCTION: Can user access workflow?
-- ================================================================
CREATE OR REPLACE FUNCTION can_user_access_workflow(
  p_user_id UUID,
  p_workflow_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_workflow RECORD;
BEGIN
  -- Get workflow details
  SELECT
    user_id,
    organization_id,
    team_id,
    visibility
  INTO v_workflow
  FROM workflows
  WHERE id = p_workflow_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check access based on visibility
  IF v_workflow.visibility = 'private' THEN
    RETURN v_workflow.user_id = p_user_id;
  END IF;

  IF v_workflow.visibility = 'team' AND v_workflow.team_id IS NOT NULL THEN
    RETURN is_user_in_team(p_user_id, v_workflow.team_id);
  END IF;

  IF v_workflow.visibility = 'organization' AND v_workflow.organization_id IS NOT NULL THEN
    RETURN is_user_in_organization(p_user_id, v_workflow.organization_id);
  END IF;

  IF v_workflow.visibility = 'public' THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ================================================================
-- GRANT EXECUTE PERMISSIONS
-- ================================================================
GRANT EXECUTE ON FUNCTION is_user_in_team TO authenticated;
GRANT EXECUTE ON FUNCTION is_user_in_organization TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_teams_in_org TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_team_role TO authenticated;
GRANT EXECUTE ON FUNCTION can_user_access_workflow TO authenticated;
```

**Usage Examples:**
```sql
-- Check if user can access workflow
SELECT can_user_access_workflow(auth.uid(), 'workflow-uuid');

-- Get user's teams in organization
SELECT * FROM get_user_teams_in_org(auth.uid(), 'org-uuid');

-- Check user's role in team
SELECT get_user_team_role(auth.uid(), 'team-uuid');
```

---

### 1.3 - Add Billing Columns to Organizations Table

**File:** `/supabase/migrations/[timestamp]_add_organization_billing.sql`

**Objectives:**
- Enable organization-level billing (not per-user)
- Track shared task pool for organization
- Support Business and Enterprise plans

**Implementation:**

```sql
-- ================================================================
-- ADD BILLING COLUMNS TO ORGANIZATIONS
-- ================================================================

-- Add plan tracking
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'business'
CHECK (plan IN ('business', 'enterprise', 'custom'));

-- Add task tracking (shared pool)
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS tasks_limit INTEGER DEFAULT 10000;

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS tasks_used INTEGER DEFAULT 0;

-- Add billing cycle tracking
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS billing_cycle_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month');

-- Add subscription tracking (for Stripe integration)
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active'
CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing'));

-- ================================================================
-- INDEXES
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_organizations_plan ON public.organizations(plan);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer
  ON public.organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ================================================================
-- FUNCTION: Reset organization task usage monthly
-- ================================================================
CREATE OR REPLACE FUNCTION reset_organization_tasks()
RETURNS void AS $$
BEGIN
  -- Reset tasks for organizations whose billing cycle has ended
  UPDATE organizations
  SET
    tasks_used = 0,
    billing_cycle_start = NOW(),
    billing_cycle_end = NOW() + INTERVAL '1 month'
  WHERE billing_cycle_end < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- SCHEDULED JOB: Reset tasks monthly (requires pg_cron extension)
-- ================================================================
-- Note: Run this manually or set up Supabase Edge Function
-- SELECT cron.schedule(
--   'reset-organization-tasks',
--   '0 0 * * *', -- Daily at midnight
--   $$SELECT reset_organization_tasks()$$
-- );

-- ================================================================
-- RLS POLICIES FOR BILLING DATA
-- ================================================================

-- Organization owners can view billing data
CREATE POLICY "Organization owners can view billing"
  ON public.organizations FOR SELECT
  USING (
    owner_id = auth.uid()
    OR
    -- Or user is in organization with finance/admin role
    EXISTS (
      SELECT 1 FROM teams
      INNER JOIN team_members ON teams.id = team_members.team_id
      WHERE teams.organization_id = organizations.id
      AND team_members.user_id = auth.uid()
      AND team_members.role IN ('owner', 'admin', 'finance')
    )
  );

-- Only owners can update billing info
CREATE POLICY "Organization owners can update billing"
  ON public.organizations FOR UPDATE
  USING (owner_id = auth.uid());
```

**Default Plan Limits:**
```typescript
const PLAN_LIMITS = {
  business: {
    tasks_limit: 10000,
    max_teams: 10,
    max_members: 50,
    price_monthly: 99
  },
  enterprise: {
    tasks_limit: 100000,
    max_teams: -1, // unlimited
    max_members: -1, // unlimited
    price_monthly: 499
  }
}
```

---

### 1.4 - Update Workflow API Routes for Team Filtering

**File:** `/app/api/workflows/route.ts`

**Objectives:**
- **UNIFIED VIEW**: Fetch ALL workflows user has access to (personal + all teams)
- Optional filtering by context (organization, team, visibility)
- Respect team membership and visibility rules
- Return team and organization metadata with workflows

**Current Code Issues:**
```typescript
// ❌ CURRENT: Only filters by user_id
const { data, error } = await supabase
  .from("workflows")
  .select("*")
  .eq("user_id", user.id)
```

**New Implementation (Option B: Unified View):**

```typescript
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { queryWithTimeout } from '@/lib/utils/fetch-with-timeout'

// ================================================================
// GET /api/workflows - Fetch ALL accessible workflows with optional filtering
// ================================================================
export async function GET(request: Request) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    // Parse query parameters for OPTIONAL filtering
    const url = new URL(request.url)
    const filterContext = url.searchParams.get('filter_context') // 'personal' | 'organization' | 'team'
    const organizationId = url.searchParams.get('organization_id')
    const teamId = url.searchParams.get('team_id')
    const visibility = url.searchParams.get('visibility')

    // ================================================================
    // STEP 1: Build query for ALL accessible workflows
    // ================================================================

    // Get all teams user is member of (for any organization or standalone)
    const { data: userTeamMemberships } = await queryWithTimeout(
      supabase
        .from("team_members")
        .select("team_id, teams!inner(id, organization_id)")
        .eq("user_id", user.id),
      8000
    )

    const allTeamIds = userTeamMemberships?.map(tm => tm.team_id) || []
    const allOrgIds = [
      ...new Set(
        userTeamMemberships
          ?.map(tm => tm.teams.organization_id)
          .filter(id => id !== null) || []
      )
    ]

    // Build comprehensive query for ALL workflows user can access
    let query = supabase
      .from("workflows")
      .select(`
        *,
        team:teams(id, name, slug, color, organization_id),
        organization:organizations(id, name, slug),
        creator:profiles!workflows_user_id_fkey(id, email, full_name, username)
      `)

    // Build OR conditions for all accessible workflows:
    // 1. Personal workflows (user_id = current user, no org, no team)
    // 2. Team workflows (team_id in user's teams, visibility = 'team')
    // 3. Organization workflows (org_id in user's orgs, visibility = 'organization')
    // 4. Private workflows created by user in any context
    // 5. Public workflows (future)

    const conditions = []

    // Personal workflows
    conditions.push(`and(user_id.eq.${user.id},organization_id.is.null,team_id.is.null)`)

    // Private workflows in team/org contexts created by user
    conditions.push(`and(user_id.eq.${user.id},visibility.eq.private)`)

    // Team workflows
    if (allTeamIds.length > 0) {
      conditions.push(
        `and(team_id.in.(${allTeamIds.join(',')}),visibility.eq.team)`
      )
    }

    // Organization workflows
    if (allOrgIds.length > 0) {
      conditions.push(
        `and(organization_id.in.(${allOrgIds.join(',')}),visibility.eq.organization)`
      )
    }

    // Public workflows (future)
    conditions.push(`visibility.eq.public`)

    // Combine all conditions with OR
    query = query.or(conditions.join(','))

    // ================================================================
    // STEP 2: Apply OPTIONAL filters if specified
    // ================================================================

    if (filterContext === 'personal') {
      // Filter to only personal workflows
      query = query
        .is("organization_id", null)
        .is("team_id", null)
    } else if (filterContext === 'organization' && organizationId) {
      // Filter to specific organization
      query = query.eq("organization_id", organizationId)
    } else if (filterContext === 'team' && teamId) {
      // Verify user is member of this team
      if (!allTeamIds.includes(teamId)) {
        return errorResponse("Not authorized to access this team", 403)
      }
      // Filter to specific team
      query = query.eq("team_id", teamId)
    }

    // Apply visibility filter if specified
    if (visibility) {
      query = query.eq("visibility", visibility)
    }

    // ================================================================
    // STEP 3: Execute query and return
    // ================================================================

    const { data, error } = await queryWithTimeout(
      query.order("updated_at", { ascending: false }),
      8000
    )

    if (error) {
      return errorResponse(error.message, 500)
    }

    return jsonResponse(data)
  } catch (error: any) {
    return errorResponse("Internal server error", 500)
  }
}

// ================================================================
// POST /api/workflows - Create workflow in context
// ================================================================
export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    const body = await request.json()
    const {
      name,
      description,
      organization_id,
      team_id,
      visibility = 'private',
      folder_id,
      status = 'draft'
    } = body

    // Validation: If team_id specified, verify user is member
    if (team_id) {
      const { data: membership } = await queryWithTimeout(
        supabase
          .from("team_members")
          .select("role")
          .eq("team_id", team_id)
          .eq("user_id", user.id)
          .single(),
        8000
      )

      if (!membership) {
        return errorResponse("Not authorized to create workflows in this team", 403)
      }
    }

    // Validation: If organization_id specified, verify user is in organization
    if (organization_id) {
      const isInOrg = await queryWithTimeout(
        supabase.rpc('is_user_in_organization', {
          p_user_id: user.id,
          p_organization_id: organization_id
        }),
        8000
      )

      if (!isInOrg.data) {
        return errorResponse("Not authorized to create workflows in this organization", 403)
      }
    }

    // Validation: visibility = 'team' requires team_id
    if (visibility === 'team' && !team_id) {
      return errorResponse("Team workflows require team_id", 400)
    }

    // Validation: visibility = 'organization' requires organization_id
    if (visibility === 'organization' && !organization_id) {
      return errorResponse("Organization workflows require organization_id", 400)
    }

    // If no folder_id, use default folder for context
    let targetFolderId = folder_id
    if (!targetFolderId) {
      let folderQuery = supabase
        .from("workflow_folders")
        .select("id")
        .eq("is_default", true)

      if (team_id) {
        folderQuery = folderQuery.eq("team_id", team_id)
      } else if (organization_id) {
        folderQuery = folderQuery.eq("organization_id", organization_id).is("team_id", null)
      } else {
        folderQuery = folderQuery.eq("user_id", user.id).is("organization_id", null)
      }

      const { data: defaultFolder } = await folderQuery.single()
      targetFolderId = defaultFolder?.id || null
    }

    // Create workflow
    const { data, error } = await queryWithTimeout(
      supabase
        .from("workflows")
        .insert({
          name,
          description,
          organization_id: organization_id || null,
          team_id: team_id || null,
          visibility,
          folder_id: targetFolderId,
          user_id: user.id,
          nodes: [],
          connections: [],
          status,
        })
        .select(`
          *,
          team:teams(id, name, slug, color),
          organization:organizations(id, name, slug)
        `)
        .single(),
      8000
    )

    if (error) {
      return errorResponse(error.message, 500)
    }

    return successResponse({ workflow: data })
  } catch (error: any) {
    return errorResponse("Internal server error", 500)
  }
}
```

**Key Changes (Option B: Unified View):**
1. ✅ **Default: Fetch ALL workflows** user has access to (personal + all teams)
2. ✅ **Optional filtering** via `filter_context`, `organization_id`, `team_id`, `visibility` params
3. ✅ Fetches workflows with team/org metadata via joins
4. ✅ Validates team membership before returning team workflows
5. ✅ Single query with OR conditions (efficient, no N+1)
6. ✅ No workspace switching required - users see everything they can access

**Benefits:**
- 🎯 **Better UX**: Users see all their workflows without switching contexts
- 📁 **Folder organization**: Frontend can group by context (Personal, Teams, Orgs)
- 🔍 **Easy filtering**: Optional params let users filter to specific context
- ⚡ **Performance**: Single query with proper indexes
- 🔐 **Security**: RLS policies still enforce access control

**API Usage Examples:**
```typescript
// Default: Get ALL workflows user has access to
GET /api/workflows
// Returns: Personal + all team workflows + all org workflows

// Filter to personal only
GET /api/workflows?filter_context=personal

// Filter to specific organization
GET /api/workflows?filter_context=organization&organization_id=org-uuid

// Filter to specific team
GET /api/workflows?filter_context=team&team_id=team-uuid

// Filter by visibility
GET /api/workflows?visibility=private
```

---

### 1.5 - Update Folder API Routes for Team Filtering

**File:** `/app/api/workflow-folders/route.ts` (create if doesn't exist)

**Objectives:**
- **UNIFIED VIEW**: Fetch ALL folders user has access to (personal + all teams)
- Optional filtering by context
- Respect team membership
- Return team metadata with folders

**Implementation (Option B: Unified View):**

```typescript
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { queryWithTimeout } from '@/lib/utils/fetch-with-timeout'

// ================================================================
// GET /api/workflow-folders - Fetch ALL accessible folders with optional filtering
// ================================================================
export async function GET(request: Request) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    // Parse optional filters
    const url = new URL(request.url)
    const filterContext = url.searchParams.get('filter_context')
    const organizationId = url.searchParams.get('organization_id')
    const teamId = url.searchParams.get('team_id')

    // ================================================================
    // STEP 1: Build query for ALL accessible folders
    // ================================================================

    // Get all teams user is member of
    const { data: userTeamMemberships } = await queryWithTimeout(
      supabase
        .from("team_members")
        .select("team_id, teams!inner(id, organization_id)")
        .eq("user_id", user.id),
      8000
    )

    const allTeamIds = userTeamMemberships?.map(tm => tm.team_id) || []
    const allOrgIds = [
      ...new Set(
        userTeamMemberships
          ?.map(tm => tm.teams.organization_id)
          .filter(id => id !== null) || []
      )
    ]

    let query = supabase
      .from("workflow_folders")
      .select(`
        *,
        team:teams(id, name, slug, color, organization_id),
        organization:organizations(id, name, slug)
      `)

    // Build OR conditions for all accessible folders
    const conditions = []

    // Personal folders
    conditions.push(`and(user_id.eq.${user.id},organization_id.is.null,team_id.is.null)`)

    // Team folders
    if (allTeamIds.length > 0) {
      conditions.push(`team_id.in.(${allTeamIds.join(',')})`)
    }

    // Organization-wide folders (team_id = NULL, org_id in user's orgs)
    if (allOrgIds.length > 0) {
      conditions.push(
        `and(organization_id.in.(${allOrgIds.join(',')}),team_id.is.null)`
      )
    }

    query = query.or(conditions.join(','))

    // ================================================================
    // STEP 2: Apply OPTIONAL filters if specified
    // ================================================================

    if (filterContext === 'personal') {
      query = query
        .is("organization_id", null)
        .is("team_id", null)
    } else if (filterContext === 'organization' && organizationId) {
      query = query.eq("organization_id", organizationId)
    } else if (filterContext === 'team' && teamId) {
      if (!allTeamIds.includes(teamId)) {
        return errorResponse("Not authorized to access this team", 403)
      }
      query = query.eq("team_id", teamId)
    }

    // ================================================================
    // STEP 3: Execute query and return
    // ================================================================

    const { data, error } = await queryWithTimeout(
      query.order("name"),
      8000
    )

    if (error) {
      return errorResponse(error.message, 500)
    }

    return jsonResponse(data)
  } catch (error: any) {
    return errorResponse("Internal server error", 500)
  }
}

// ================================================================
// POST /api/workflow-folders - Create folder in context
// ================================================================
export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated", 401)
    }

    const body = await request.json()
    const {
      name,
      description,
      organization_id,
      team_id,
      color = '#3B82F6',
      icon = 'folder'
    } = body

    // Validate team membership if creating team folder
    if (team_id) {
      const { data: membership } = await queryWithTimeout(
        supabase
          .from("team_members")
          .select("role")
          .eq("team_id", team_id)
          .eq("user_id", user.id)
          .single(),
        8000
      )

      if (!membership) {
        return errorResponse("Not authorized", 403)
      }
    }

    const { data, error } = await queryWithTimeout(
      supabase
        .from("workflow_folders")
        .insert({
          name,
          description,
          organization_id: organization_id || null,
          team_id: team_id || null,
          color,
          icon,
          user_id: user.id,
          is_default: false
        })
        .select(`
          *,
          team:teams(id, name, slug, color),
          organization:organizations(id, name, slug)
        `)
        .single(),
      8000
    )

    if (error) {
      return errorResponse(error.message, 500)
    }

    return successResponse({ folder: data })
  } catch (error: any) {
    return errorResponse("Internal server error", 500)
  }
}
```

---

### 1.6 - Create Team Context Utilities

**File:** `/lib/utils/team-context.ts`

**Objectives:**
- Centralize workspace context logic
- Provide utilities for determining current context
- Helper functions for access control

**Implementation:**

```typescript
import { getSupabaseClient } from '@/lib/supabase'
import { queryWithTimeout } from './fetch-with-timeout'

// ================================================================
// TYPES
// ================================================================

export type WorkspaceContext =
  | { type: 'personal' }
  | { type: 'organization'; organizationId: string }
  | { type: 'team'; teamId: string; organizationId?: string }

export interface TeamMembership {
  team_id: string
  team_name: string
  team_slug: string
  team_color: string
  role: string
  organization_id?: string
}

export interface OrganizationMembership {
  organization_id: string
  organization_name: string
  teams: TeamMembership[]
}

// ================================================================
// WORKSPACE CONTEXT DETECTION
// ================================================================

/**
 * Parse workspace context from URL or localStorage
 */
export function parseWorkspaceContext(
  url?: URL,
  storedContext?: string | null
): WorkspaceContext {
  // Try URL params first
  if (url) {
    const organizationId = url.searchParams.get('organization_id')
    const teamId = url.searchParams.get('team_id')

    if (teamId) {
      return {
        type: 'team',
        teamId,
        organizationId: organizationId || undefined
      }
    }

    if (organizationId) {
      return { type: 'organization', organizationId }
    }
  }

  // Try stored context
  if (storedContext) {
    try {
      const parsed = JSON.parse(storedContext)
      return parsed
    } catch {
      // Invalid JSON, fallback to personal
    }
  }

  // Default to personal
  return { type: 'personal' }
}

/**
 * Store workspace context to localStorage
 */
export function storeWorkspaceContext(context: WorkspaceContext) {
  if (typeof window === 'undefined') return
  localStorage.setItem('current_workspace_context', JSON.stringify(context))
}

/**
 * Get stored workspace context
 */
export function getStoredWorkspaceContext(): WorkspaceContext | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem('current_workspace_context')
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

// ================================================================
// MEMBERSHIP QUERIES
// ================================================================

/**
 * Get user's team memberships (all teams across all organizations)
 */
export async function getUserTeamMemberships(
  userId: string
): Promise<TeamMembership[]> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await queryWithTimeout(
    supabase
      .from('team_members')
      .select(`
        team_id,
        role,
        team:teams(
          id,
          name,
          slug,
          color,
          organization_id
        )
      `)
      .eq('user_id', userId),
    8000
  )

  if (error) throw error

  return data?.map(m => ({
    team_id: m.team.id,
    team_name: m.team.name,
    team_slug: m.team.slug,
    team_color: m.team.color,
    role: m.role,
    organization_id: m.team.organization_id || undefined
  })) || []
}

/**
 * Get user's organization memberships (organizations + teams within)
 */
export async function getUserOrganizationMemberships(
  userId: string
): Promise<OrganizationMembership[]> {
  const memberships = await getUserTeamMemberships(userId)

  // Group by organization
  const orgMap = new Map<string, OrganizationMembership>()

  for (const membership of memberships) {
    if (!membership.organization_id) continue // Skip standalone teams

    if (!orgMap.has(membership.organization_id)) {
      // Fetch organization name
      const supabase = getSupabaseClient()
      if (!supabase) continue

      const { data: org } = await queryWithTimeout(
        supabase
          .from('organizations')
          .select('id, name')
          .eq('id', membership.organization_id)
          .single(),
        8000
      )

      if (org) {
        orgMap.set(membership.organization_id, {
          organization_id: org.id,
          organization_name: org.name,
          teams: []
        })
      }
    }

    orgMap.get(membership.organization_id)?.teams.push(membership)
  }

  return Array.from(orgMap.values())
}

/**
 * Check if user can access team
 */
export async function canUserAccessTeam(
  userId: string,
  teamId: string
): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  const { data } = await queryWithTimeout(
    supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', userId)
      .eq('team_id', teamId)
      .single(),
    8000
  )

  return !!data
}

/**
 * Check if user can access organization
 */
export async function canUserAccessOrganization(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) return false

  const { data } = await queryWithTimeout(
    supabase.rpc('is_user_in_organization', {
      p_user_id: userId,
      p_organization_id: organizationId
    }),
    8000
  )

  return data === true
}

// ================================================================
// VISIBILITY HELPERS
// ================================================================

/**
 * Get allowed visibility options based on context
 */
export function getAllowedVisibilityOptions(
  context: WorkspaceContext
): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [
    { value: 'private', label: 'Private (only me)' }
  ]

  if (context.type === 'team') {
    options.push({ value: 'team', label: 'Team (team members)' })
  }

  if (context.type === 'organization' || context.organizationId) {
    options.push({ value: 'organization', label: 'Organization (all teams)' })
  }

  return options
}

/**
 * Validate visibility for context
 */
export function validateVisibility(
  visibility: string,
  context: WorkspaceContext
): { valid: boolean; error?: string } {
  if (visibility === 'private') {
    return { valid: true }
  }

  if (visibility === 'team') {
    if (context.type !== 'team') {
      return {
        valid: false,
        error: 'Team visibility requires team context'
      }
    }
    return { valid: true }
  }

  if (visibility === 'organization') {
    if (context.type === 'personal') {
      return {
        valid: false,
        error: 'Organization visibility requires organization context'
      }
    }
    return { valid: true }
  }

  return { valid: false, error: 'Invalid visibility' }
}

// ================================================================
// CONTEXT SWITCHING
// ================================================================

/**
 * Build URL with workspace context
 */
export function buildWorkflowsUrl(context: WorkspaceContext): string {
  const params = new URLSearchParams()

  if (context.type === 'organization') {
    params.set('organization_id', context.organizationId)
  } else if (context.type === 'team') {
    params.set('team_id', context.teamId)
    if (context.organizationId) {
      params.set('organization_id', context.organizationId)
    }
  }

  const queryString = params.toString()
  return `/workflows${queryString ? `?${queryString}` : ''}`
}
```

---

## Phase 2: Core Business Logic

### 2.1 - Create Team Permission Service

**File:** `/lib/services/team-permissions.ts`

**Objectives:**
- Centralize permission logic
- Role-based access control (RBAC)
- Reusable permission checks

**Implementation:**

```typescript
import { getSupabaseClient } from '@/lib/supabase'
import { queryWithTimeout } from '@/lib/utils/fetch-with-timeout'

// ================================================================
// TYPES
// ================================================================

export type TeamRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'hr'
  | 'finance'
  | 'lead'
  | 'member'
  | 'guest'

export interface Permission {
  canView: boolean
  canEdit: boolean
  canDelete: boolean
  canInvite: boolean
  canManageBilling: boolean
  canManageTeam: boolean
}

// ================================================================
// ROLE HIERARCHY
// ================================================================

const ROLE_HIERARCHY: Record<TeamRole, number> = {
  owner: 8,
  admin: 7,
  manager: 6,
  hr: 5,
  finance: 4,
  lead: 3,
  member: 2,
  guest: 1
}

/**
 * Check if role A has higher or equal privilege than role B
 */
export function hasRolePrivilege(roleA: TeamRole, roleB: TeamRole): boolean {
  return ROLE_HIERARCHY[roleA] >= ROLE_HIERARCHY[roleB]
}

// ================================================================
// PERMISSION CALCULATION
// ================================================================

/**
 * Get permissions for a role
 */
export function getPermissionsForRole(role: TeamRole): Permission {
  const permissions: Permission = {
    canView: false,
    canEdit: false,
    canDelete: false,
    canInvite: false,
    canManageBilling: false,
    canManageTeam: false
  }

  // All roles can view
  permissions.canView = true

  // Member and above can edit
  if (hasRolePrivilege(role, 'member')) {
    permissions.canEdit = true
  }

  // Lead and above can invite
  if (hasRolePrivilege(role, 'lead')) {
    permissions.canInvite = true
  }

  // HR can invite (special case)
  if (role === 'hr') {
    permissions.canInvite = true
  }

  // Finance can manage billing (special case)
  if (role === 'finance' || hasRolePrivilege(role, 'admin')) {
    permissions.canManageBilling = true
  }

  // Manager and above can manage team
  if (hasRolePrivilege(role, 'manager')) {
    permissions.canManageTeam = true
  }

  // Admin and above can delete
  if (hasRolePrivilege(role, 'admin')) {
    permissions.canDelete = true
  }

  return permissions
}

/**
 * Get user's permissions in team
 */
export async function getUserTeamPermissions(
  userId: string,
  teamId: string
): Promise<Permission | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const { data, error } = await queryWithTimeout(
    supabase
      .from('team_members')
      .select('role')
      .eq('user_id', userId)
      .eq('team_id', teamId)
      .single(),
    8000
  )

  if (error || !data) return null

  return getPermissionsForRole(data.role as TeamRole)
}

// ================================================================
// WORKFLOW PERMISSIONS
// ================================================================

export interface WorkflowPermissions {
  canView: boolean
  canEdit: boolean
  canDelete: boolean
  canShare: boolean
  canActivate: boolean
}

/**
 * Get user's permissions for a specific workflow
 */
export async function getUserWorkflowPermissions(
  userId: string,
  workflowId: string
): Promise<WorkflowPermissions> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      canView: false,
      canEdit: false,
      canDelete: false,
      canShare: false,
      canActivate: false
    }
  }

  // Fetch workflow
  const { data: workflow, error } = await queryWithTimeout(
    supabase
      .from('workflows')
      .select('user_id, organization_id, team_id, visibility')
      .eq('id', workflowId)
      .single(),
    8000
  )

  if (error || !workflow) {
    return {
      canView: false,
      canEdit: false,
      canDelete: false,
      canShare: false,
      canActivate: false
    }
  }

  const permissions: WorkflowPermissions = {
    canView: false,
    canEdit: false,
    canDelete: false,
    canShare: false,
    canActivate: false
  }

  // Creator always has full permissions
  if (workflow.user_id === userId) {
    return {
      canView: true,
      canEdit: true,
      canDelete: true,
      canShare: true,
      canActivate: true
    }
  }

  // Check team membership if team workflow
  if (workflow.team_id) {
    const teamPerms = await getUserTeamPermissions(userId, workflow.team_id)

    if (!teamPerms) {
      return permissions // Not in team, no access
    }

    permissions.canView = teamPerms.canView
    permissions.canEdit = teamPerms.canEdit && workflow.visibility === 'team'
    permissions.canDelete = teamPerms.canDelete
    permissions.canShare = teamPerms.canManageTeam
    permissions.canActivate = teamPerms.canEdit
  }
  // Organization workflow
  else if (workflow.visibility === 'organization' && workflow.organization_id) {
    // Check if user is in any team in organization
    const { data: inOrg } = await queryWithTimeout(
      supabase.rpc('is_user_in_organization', {
        p_user_id: userId,
        p_organization_id: workflow.organization_id
      }),
      8000
    )

    if (inOrg) {
      permissions.canView = true
      // Only creator can edit/delete org-wide workflows by default
      permissions.canEdit = false
      permissions.canDelete = false
      permissions.canShare = false
      permissions.canActivate = false
    }
  }
  // Public workflow
  else if (workflow.visibility === 'public') {
    permissions.canView = true
    // Only creator can edit public workflows
  }

  return permissions
}

// ================================================================
// PERMISSION CHECKS (throw errors)
// ================================================================

/**
 * Assert user can edit workflow (throws if not)
 */
export async function assertCanEditWorkflow(
  userId: string,
  workflowId: string
): Promise<void> {
  const perms = await getUserWorkflowPermissions(userId, workflowId)
  if (!perms.canEdit) {
    throw new Error('Not authorized to edit this workflow')
  }
}

/**
 * Assert user can delete workflow (throws if not)
 */
export async function assertCanDeleteWorkflow(
  userId: string,
  workflowId: string
): Promise<void> {
  const perms = await getUserWorkflowPermissions(userId, workflowId)
  if (!perms.canDelete) {
    throw new Error('Not authorized to delete this workflow')
  }
}

/**
 * Assert user can activate workflow (throws if not)
 */
export async function assertCanActivateWorkflow(
  userId: string,
  workflowId: string
): Promise<void> {
  const perms = await getUserWorkflowPermissions(userId, workflowId)
  if (!perms.canActivate) {
    throw new Error('Not authorized to activate this workflow')
  }
}
```

**Usage Example:**
```typescript
// In API route
import { assertCanEditWorkflow } from '@/lib/services/team-permissions'

export async function PUT(request: Request) {
  const { user } = await supabase.auth.getUser()
  const { workflowId } = await request.json()

  // Will throw if not authorized
  await assertCanEditWorkflow(user.id, workflowId)

  // Proceed with update...
}
```

---

### 2.2 - Create Workspace Context Manager

**File:** `/lib/services/workspace-context.ts`

**Objectives:**
- Manage current workspace state
- Handle context switching
- Provide context-aware data fetching

**Implementation:**

```typescript
import { getSupabaseClient } from '@/lib/supabase'
import { queryWithTimeout } from '@/lib/utils/fetch-with-timeout'
import {
  WorkspaceContext,
  parseWorkspaceContext,
  storeWorkspaceContext,
  getUserOrganizationMemberships,
  getUserTeamMemberships
} from '@/lib/utils/team-context'

// ================================================================
// WORKSPACE CONTEXT MANAGER
// ================================================================

export class WorkspaceContextManager {
  private currentContext: WorkspaceContext
  private userId: string

  constructor(userId: string, initialContext?: WorkspaceContext) {
    this.userId = userId
    this.currentContext = initialContext || { type: 'personal' }
  }

  /**
   * Get current context
   */
  getContext(): WorkspaceContext {
    return this.currentContext
  }

  /**
   * Switch to personal workspace
   */
  switchToPersonal() {
    this.currentContext = { type: 'personal' }
    storeWorkspaceContext(this.currentContext)
  }

  /**
   * Switch to organization workspace
   */
  async switchToOrganization(organizationId: string) {
    // Verify user has access
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error('Supabase not configured')

    const { data: hasAccess } = await queryWithTimeout(
      supabase.rpc('is_user_in_organization', {
        p_user_id: this.userId,
        p_organization_id: organizationId
      }),
      8000
    )

    if (!hasAccess) {
      throw new Error('Not authorized to access this organization')
    }

    this.currentContext = { type: 'organization', organizationId }
    storeWorkspaceContext(this.currentContext)
  }

  /**
   * Switch to team workspace
   */
  async switchToTeam(teamId: string, organizationId?: string) {
    // Verify user is team member
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error('Supabase not configured')

    const { data: membership } = await queryWithTimeout(
      supabase
        .from('team_members')
        .select('role, teams!inner(organization_id)')
        .eq('user_id', this.userId)
        .eq('team_id', teamId)
        .single(),
      8000
    )

    if (!membership) {
      throw new Error('Not authorized to access this team')
    }

    this.currentContext = {
      type: 'team',
      teamId,
      organizationId: organizationId || membership.teams.organization_id || undefined
    }
    storeWorkspaceContext(this.currentContext)
  }

  /**
   * Get workflows for current context
   */
  async getWorkflows() {
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error('Supabase not configured')

    const context = this.currentContext

    let query = supabase
      .from('workflows')
      .select(`
        *,
        team:teams(id, name, slug, color),
        organization:organizations(id, name, slug),
        creator:profiles!workflows_user_id_fkey(id, email, full_name, username)
      `)

    // Apply context filters
    if (context.type === 'personal') {
      query = query
        .eq('user_id', this.userId)
        .is('organization_id', null)
        .is('team_id', null)
    } else if (context.type === 'team') {
      query = query.eq('team_id', context.teamId)
    } else if (context.type === 'organization') {
      // Get user's teams in org
      const { data: userTeams } = await queryWithTimeout(
        supabase
          .from('team_members')
          .select('team_id, teams!inner(organization_id)')
          .eq('user_id', this.userId)
          .eq('teams.organization_id', context.organizationId),
        8000
      )

      const teamIds = userTeams?.map(tm => tm.team_id) || []

      if (teamIds.length > 0) {
        query = query.or(
          `and(organization_id.eq.${context.organizationId},visibility.eq.organization),` +
          `and(organization_id.eq.${context.organizationId},team_id.in.(${teamIds.join(',')}),visibility.eq.team)`
        )
      } else {
        // User not in any team, only see org-wide workflows
        query = query
          .eq('organization_id', context.organizationId)
          .eq('visibility', 'organization')
      }
    }

    const { data, error } = await queryWithTimeout(
      query.order('updated_at', { ascending: false }),
      8000
    )

    if (error) throw error

    return data || []
  }

  /**
   * Get folders for current context
   */
  async getFolders() {
    const supabase = getSupabaseClient()
    if (!supabase) throw new Error('Supabase not configured')

    const context = this.currentContext

    let query = supabase
      .from('workflow_folders')
      .select(`
        *,
        team:teams(id, name, slug, color),
        organization:organizations(id, name, slug)
      `)

    if (context.type === 'personal') {
      query = query
        .eq('user_id', this.userId)
        .is('organization_id', null)
        .is('team_id', null)
    } else if (context.type === 'team') {
      query = query.eq('team_id', context.teamId)
    } else if (context.type === 'organization') {
      // Get user's teams
      const { data: userTeams } = await queryWithTimeout(
        supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', this.userId),
        8000
      )

      const teamIds = userTeams?.map(tm => tm.team_id) || []

      query = query
        .eq('organization_id', context.organizationId)
        .or(`team_id.is.null,team_id.in.(${teamIds.join(',')})`)
    }

    const { data, error } = await queryWithTimeout(
      query.order('name'),
      8000
    )

    if (error) throw error

    return data || []
  }

  /**
   * Get available contexts for user
   */
  async getAvailableContexts() {
    const contexts: Array<{
      type: string
      id?: string
      name: string
      description: string
    }> = []

    // Personal workspace (always available)
    contexts.push({
      type: 'personal',
      name: 'Personal',
      description: 'Your private workflows'
    })

    // Get organizations
    const orgs = await getUserOrganizationMemberships(this.userId)
    for (const org of orgs) {
      contexts.push({
        type: 'organization',
        id: org.organization_id,
        name: org.organization_name,
        description: `${org.teams.length} teams`
      })
    }

    // Get standalone teams
    const teams = await getUserTeamMemberships(this.userId)
    const standaloneTeams = teams.filter(t => !t.organization_id)
    for (const team of standaloneTeams) {
      contexts.push({
        type: 'team',
        id: team.team_id,
        name: team.team_name,
        description: 'Standalone team'
      })
    }

    return contexts
  }
}

/**
 * Factory function to create context manager
 */
export async function createWorkspaceContextManager(
  userId: string
): Promise<WorkspaceContextManager> {
  // Try to load stored context
  const stored = typeof window !== 'undefined'
    ? localStorage.getItem('current_workspace_context')
    : null

  const initialContext = stored
    ? parseWorkspaceContext(undefined, stored)
    : { type: 'personal' as const }

  return new WorkspaceContextManager(userId, initialContext)
}
```

---

## (Continued in next section - Phase 3: Frontend State Management)

---

## 📚 Additional Resources

### Related Documentation
- `/learning/docs/database-schema-current.md` - Current database schema
- `/lib/types/roles.ts` - Role type definitions
- `/lib/utils/permissions.ts` - Permission helpers

### Testing Strategy
- Unit tests for permission logic
- Integration tests for context switching
- E2E tests for workflows across contexts

### Migration Path for Existing Users
1. All existing workflows default to `visibility = 'private'`
2. Users with organization_id but no team_id → create "General" team
3. Migrate folders to appropriate context

---

## 🎯 Success Metrics

When implementation is complete:
✅ Users can create workflows in personal, team, or organization context
✅ Team workflows only visible to team members
✅ Organization workflows visible to all teams
✅ Workspace switcher shows all available contexts
✅ UI shows team badges on workflows
✅ Billing works at organization level
✅ RLS policies enforce all access rules
✅ No N+1 queries (optimized with joins)
✅ Zero security vulnerabilities
✅ Zero data leaks between teams

---

**End of Phase 1 Documentation. Phases 2-6 to be continued...**