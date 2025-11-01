# Workspace & Team Isolation - Master Implementation Plan

**Created:** 2025-10-27
**Updated:** 2025-10-27 (Updated for Option B: Unified View)
**Status:** Ready for Implementation
**Implementation Model:** Option C with Option B UX (Hybrid Personal + Organization + Teams with Unified Workflow View)

---

## 📖 Documentation Structure

This implementation is split across multiple documents for clarity:

### **1. Main Implementation Guide (Part 1)**
**File:** `workspace-team-isolation-implementation.md`

**Contains:**
- 🎯 Vision & Goals
- 📋 Prerequisites & Architecture Overview
- 🔨 Phase 1: Database & Backend Foundation (COMPLETE) **✨ Updated for Option B**
  - RLS policies for team-based access
  - Database helper functions
  - Organization billing columns
  - **Updated API routes - Unified view with optional filtering**
  - Team context utilities
- 🔨 Phase 2: Core Business Logic (COMPLETE)
  - Team permission service
  - Workspace context manager

**⚡ What Changed for Option B:**
- API routes now fetch ALL workflows by default (not filtered by context)
- Optional filtering via `filter_context` query parameter
- Frontend groups workflows by context for folder-based UI
- Workspace switcher controls creation context, not viewing

### **2. Frontend Implementation (Part 2)**
**File:** `workspace-team-isolation-implementation-part2.md`

**Contains:**
- 🔨 Phase 3: Frontend State Management (COMPLETE) **✨ Updated for Option B**
  - **workflowStore - Unified view with `getGroupedWorkflows()` helper**
  - teamStore for team state management
  - organizationStore updates
  - Workspace context provider
  - authStore updates
- 🔨 Phase 4: UI Components (PARTIAL - 4.1-4.3 complete)
  - OrganizationSwitcher updates
  - TeamBadge component
  - TeamFilter component (now optional, not required)
  - (Remaining: WorkflowCard, modals, folder UI)

**⚡ What Changed for Option B:**
- `fetchWorkflows()` fetches ALL by default, optional filtering
- New `getGroupedWorkflows()` method for folder-based organization
- Context switching no longer filters workflows, only sets creation context

### **3. Integration Management Guide** ✨ NEW
**File:** `workspace-integration-management.md`

**Contains:**
- 🔌 Integration scoping (personal/team/organization)
- 🔐 Permission system (use/manage/admin)
- 🎨 UI/UX for workspace-aware integrations
- 🔨 OAuth flow updates with workspace context
- 📋 Implementation checklist

**Key Concepts:**
- Workspace switcher controls which integrations are available
- Team integrations require admin permission to connect/disconnect
- Non-admins see "Ask your admin" message
- Personal integrations always manageable by owner

### **4. Remaining Work (Part 3 - TO BE CREATED)**
**File:** `workspace-team-isolation-implementation-part3.md` (future)

**Will contain:**
- Phase 4 (continued): UI Components
  - 4.4: Update WorkflowCard with team badges
  - 4.5: Update workflow creation modal with visibility selector
  - 4.6: Update folder UI with team badges
  - 4.7: Add team selector to workflow builder
- Phase 5: Billing Integration
  - Organization billing store
  - Task usage tracking at org level
  - Billing page updates
  - Sidebar task widget updates
- Phase 6: Testing & Documentation
  - Test cases for all contexts
  - Team isolation verification
  - User documentation
  - Migration guide

---

## 🎯 Clear Vision

### What We're Building

A **multi-tenant workspace architecture** where:

1. **Personal Workspace** (always exists)
   - User's private workflows
   - Individual task quota
   - Personal integrations
   - Cannot be deleted

2. **Organization Workspace** (Business/Enterprise customers)
   - Multiple teams within organization
   - Shared task pool (10K-100K tasks/month)
   - Organization-level billing
   - Teams have isolated workflows

3. **Standalone Teams** (Optional)
   - Teams without organization
   - Good for small groups upgrading from personal
   - Can later be converted to organization

### User Experience Flow (Option B: Unified View)

**Key Decision:** Workflows are **NOT** hidden by workspace switching. Users see ALL workflows they have access to in one unified view, organized by folders.

```
User logs in → Workflows Page

┌─────────────────────────────────────────────────────────┐
│ Workflows (38 total)          [Personal ▼] [+ New]     │
│                                                         │
│ Filters: [All ▼] [All Teams ▼]  🔍 Search             │
│                                                         │
│ 📁 Personal Workflows [👤 Personal] (15)               │
│    └── My Email Automation                             │
│    └── Daily Reports                                   │
│    └── ... 13 more                                     │
│                                                         │
│ 📁 BrightSpark Marketing [🏢 Organization] (18)        │
│    │                                                    │
│    ├── 📁 Marketing Team [🔵 Marketing] (4)             │
│    │   └── Social Media Auto-Post                      │
│    │   └── Email Campaigns                             │
│    │   └── ... 2 more                                  │
│    │                                                    │
│    ├── 📁 Sales Team [🟢 Sales] (6)                     │
│    │   └── Lead Routing                                │
│    │   └── CRM Updates                                 │
│    │   └── ... 4 more                                  │
│    │                                                    │
│    └── 📁 Shared Templates [🟢 All Teams] (8)          │
│        └── New Client Onboarding                       │
│        └── Invoice Processing                          │
│        └── ... 6 more                                  │
│                                                         │
│ 📁 Freelance Client A [👥 Team] (5)                    │
│    └── Client Reporting                                │
│    └── ... 4 more                                      │
└─────────────────────────────────────────────────────────┘

Workspace Switcher (with 🏠 icon - "Home Base"):
  🏠 [Personal ▼] ← Switched to → 🏠 [BrightSpark ▼]

  Effects of Switching:
  ✅ Updates "Tasks This Month" widget in bottom left sidebar
  ✅ Shows workspace's integrations in dropdown
  ✅ Pre-selects workspace in creation modal (if no default)
  ❌ Does NOT hide workflows from view

  Workspace Switcher Dropdown:
  ┌──────────────────────────────────────────┐
  │ 🏠 Personal                        ✓    │  ← Simple, clean
  ├──────────────────────────────────────────┤
  │ 🏠 BrightSpark Marketing                │
  ├──────────────────────────────────────────┤
  │ 🏠 Freelance Client A                   │
  └──────────────────────────────────────────┘

  Bottom Left Sidebar Widget (Updates on Switch):
  ┌──────────────────────────────────────────┐
  │ 📊 Tasks This Month                     │  ← Shows based on workspace
  │    50 / 100 used                  0%    │  ← Personal workspace
  │    [Upgrade Plan]                       │
  │    [Get Free Tasks]                     │
  └──────────────────────────────────────────┘

  When switched to "BrightSpark Marketing":
  ┌──────────────────────────────────────────┐
  │ 📊 Tasks This Month                     │
  │    450 / 10,000 used              4%    │  ← Organization pool
  │    [View Billing] (if admin)            │  ← Permission-based
  └──────────────────────────────────────────┘

  Widget Visibility Rules:
  ✅ Personal workspace → Always visible (your quota)
  ✅ Team/Org workspace → Visible only if you have billing/admin permissions
  ❌ Team/Org workspace → Hidden for regular members (no permission to see)

─────────────────────────────────────────────
User clicks [+ New Workflow]:
─────────────────────────────────────────────

SCENARIO 1: No Default Workspace Set
┌─────────────────────────────────────────────────┐
│ Create New Workflow                             │
│                                                 │
│ Where would you like to create this?           │
│                                                 │
│ ○ 🏠 Personal                                   │
│                                                 │
│ ● 🏠 BrightSpark Marketing                      │  ← Pre-selected (matches switcher)
│    Team: [Marketing ▼]                         │
│                                                 │
│ ○ 🏠 Freelance Client A                         │
│                                                 │
│ ☐ Set as my default workspace                  │  ← User can check
│                                                 │
│ [Cancel]  [Create Workflow]                    │
└─────────────────────────────────────────────────┘

If user checks "Set as my default workspace" and creates:
→ Shows info toast:
  ℹ️ Default workspace saved! New workflows will be created in
     BrightSpark Marketing. You can change this in Settings or
     uncheck the default when creating workflows.

─────────────────────────────────────────────
SCENARIO 2: Default Workspace IS Set
┌─────────────────────────────────────────────────┐
│ Create New Workflow                             │
│                                                 │
│ Creating in: 🏠 Personal (Default) [Change ▼]  │  ← Can expand to change
│                                                 │
│ Name: [___________________________]            │
│ Description: [___________________]             │
│ Team: N/A (Personal workspace)                 │
│ Visibility: [Private ▼]                        │
│                                                 │
│ [Cancel]  [Create Workflow]                    │
└─────────────────────────────────────────────────┘

Click [Change ▼] to expand workspace selector:
→ Shows all workspaces (like Scenario 1)
→ ☑ Set as my default workspace (pre-checked, will update default)
→ ☐ Set as my default workspace (unchecked = one-time change)

─────────────────────────────────────────────
SCENARIO 3: User Wants to Create in Different Workspace (One-Time)
User with default = "Personal"
Clicks [Change ▼] in modal
Selects "BrightSpark Marketing"
UNCHECKS "Set as my default workspace"
→ Creates this workflow in BrightSpark
→ Next workflow still defaults to Personal

─────────────────────────────────────────────
Managing Default Workspace:
─────────────────────────────────────────────

Personal Settings → Preferences:
┌─────────────────────────────────────────────────┐
│ Default Workspace                               │
│                                                 │
│ ● Use default: 🏠 [BrightSpark Marketing ▼]    │
│ ○ Ask me every time                            │
│ ○ Use current workspace switcher selection     │
│                                                 │
│ [Save Changes]                                  │
└─────────────────────────────────────────────────┘

Three Options:
1. "Use default" - Always use selected workspace
2. "Ask me every time" - Always show workspace selector
3. "Use current workspace switcher" - Use whatever is selected in switcher

Quick Filters (Optional - for viewing):
  - Click [Personal] filter → Collapse orgs, show only personal
  - Click [Marketing] filter → Show only Marketing team workflows
  - Default: Show all (folders organize everything)
```

**Benefits of This Approach:**
- ✅ See everything at once - no switching required
- ✅ Maximum flexibility - user controls default behavior
- ✅ Workspace switcher is clean and simple
- ✅ Task quota updates in existing sidebar widget (permission-based)
- ✅ Can set default OR use switcher OR ask every time
- ✅ Clear visual distinction (🏠 icon = "home base")
- ✅ One-time overrides don't change default
- ✅ Folders organize all workflows regardless of context

### Data Isolation Rules

| Visibility | Who Can See | Use Case |
|------------|-------------|----------|
| `private` | Only creator | Personal workflows, drafts |
| `team` | Team members only | Team-specific automations |
| `organization` | All teams in org | Shared templates, common processes |
| `public` | Everyone (future) | Workflow store, public templates |

---

## 📝 Implementation Checklist

### ✅ Phase 1: Database & Backend (MOSTLY COMPLETE) **✨ +1 new migration needed**
- [x] 1.1 - Update RLS policies for team-based access
- [x] 1.2 - Create database helper functions
- [x] 1.3 - Add billing columns to organizations table
- [x] 1.4 - Update workflow API routes for team filtering (unified view)
- [x] 1.5 - Update folder API routes for team filtering (unified view)
- [x] 1.6 - Create team context utilities
- [ ] **1.7 - Add default workspace columns to profiles table** ✨ NEW

### ✅ Phase 2: Core Business Logic (COMPLETE)
- [x] 2.1 - Create team permission service
- [x] 2.2 - Create workspace context manager

### ✅ Phase 3: Frontend State Management (COMPLETE)
- [x] 3.1 - Update workflowStore for team filtering
- [x] 3.2 - Create teamStore for team state
- [x] 3.3 - Update organizationStore for team queries
- [x] 3.4 - Create workspace context provider
- [x] 3.5 - Update authStore to track current workspace

### 🚧 Phase 4: UI Components (PARTIAL - 40% complete) **✨ Updated for sidebar task widget UX**
- [x] 4.1 - Update OrganizationSwitcher with team info
- [x] 4.2 - Create TeamBadge component
- [x] 4.3 - Create TeamFilter component
- [ ] 4.4 - **Update WorkspaceSwitcher (clean dropdown with 🏠 icon)**
- [ ] 4.4a - **Update Sidebar Task Widget (workspace-aware + permission-based visibility)**
- [ ] 4.5 - **Create WorkflowCreationModal with default workspace preference**
- [ ] 4.6 - **Add default workspace settings to user preferences**
- [ ] 4.7 - Update WorkflowCard with team badges
- [ ] 4.8 - Update folder UI with team badges
- [ ] 4.9 - Add team selector to workflow builder

**New Requirements (Sidebar Task Widget Enhancement):**
- 4.4: Clean workspace switcher with 🏠 icon (workspace names only)
- 4.4a: Sidebar task widget updates on workspace switch, shows/hides based on permissions
- 4.5: Workflow creation modal with 3 scenarios (no default, has default, override)
- 4.6: Settings page option: default workspace / ask every time / use switcher

### ⏳ Phase 5: Billing Integration (NOT STARTED)
- [ ] 5.1 - Update billing store for organization billing
- [ ] 5.2 - Create organization task usage tracking
- [ ] 5.3 - Update task limit checks for org context
- [ ] 5.4 - Add organization billing page
- [ ] 5.5 - Update sidebar task widget for org context

### ⏳ Phase 6: Testing & Documentation (NOT STARTED)
- [ ] 6.1 - Test personal workspace workflows
- [ ] 6.2 - Test standalone team workflows
- [ ] 6.3 - Test organization with multiple teams
- [ ] 6.4 - Test team isolation (users can't see other teams)
- [ ] 6.5 - Test organization-wide sharing
- [ ] 6.6 - Update user documentation
- [ ] 6.7 - Create migration guide for existing users

---

## 🏗️ Technical Architecture Summary

### Database Schema (Already Updated)

```sql
-- Workflows
workflows
├── id
├── name
├── user_id (creator)
├── organization_id (FK, nullable)
├── team_id (FK, nullable) ✨ NEW
├── visibility (enum) ✨ NEW
├── folder_id
├── nodes
├── connections
├── status

-- Folders
workflow_folders
├── id
├── name
├── user_id (creator)
├── organization_id (FK, nullable)
├── team_id (FK, nullable) ✨ NEW
├── color
├── icon

-- Teams (existing)
teams
├── id
├── organization_id (FK, nullable) -- NULL = standalone team
├── name
├── slug
├── color

-- Team Members (existing)
team_members
├── id
├── team_id (FK)
├── user_id (FK)
├── role (owner, admin, manager, hr, finance, lead, member, guest)

-- Organizations (existing + billing)
organizations
├── id
├── name
├── owner_id
├── plan ✨ NEW
├── tasks_limit ✨ NEW
├── tasks_used ✨ NEW
├── billing_cycle_start ✨ NEW

-- Profiles (existing + default workspace)
profiles
├── id
├── email
├── full_name
├── avatar_url
├── tasks_limit
├── tasks_used
├── plan
├── default_workspace_id ✨ NEW (FK to workspaces/orgs/teams)
├── default_workspace_type ✨ NEW ('personal' | 'organization' | 'team')
├── workflow_creation_mode ✨ NEW ('default' | 'ask' | 'follow_switcher')
```

**New Profile Columns for Default Workspace:**
- `default_workspace_id` - UUID of workspace/org/team to use as default
- `default_workspace_type` - Type of default workspace ('personal', 'organization', 'team')
- `workflow_creation_mode` - How to handle workflow creation:
  - `'default'` - Use default_workspace_id
  - `'ask'` - Always show workspace selector
  - `'follow_switcher'` - Use current workspace switcher selection

### Key Files Created/Updated

**Backend:**
- `/supabase/migrations/[timestamp]_add_team_isolation_rls.sql` - RLS policies
- `/supabase/migrations/[timestamp]_add_team_helper_functions.sql` - SQL functions
- `/supabase/migrations/[timestamp]_add_organization_billing.sql` - Billing columns
- `/app/api/workflows/route.ts` - Updated for team filtering
- `/app/api/workflow-folders/route.ts` - Updated for team filtering
- `/lib/utils/team-context.ts` - Context utilities
- `/lib/services/team-permissions.ts` - Permission service
- `/lib/services/workspace-context.ts` - Context manager

**Frontend:**
- `/stores/workflowStore.ts` - Updated with context awareness
- `/stores/teamStore.ts` - New team state management
- `/stores/organizationStore.ts` - Updated with team queries
- `/components/providers/WorkspaceContextProvider.tsx` - Context provider
- `/components/workflows/TeamBadge.tsx` - Badge components
- `/components/workflows/TeamFilter.tsx` - Team filter dropdown
- `/components/new-design/OrganizationSwitcher.tsx` - Updated with teams

---

## 🔐 Security & Access Control

### RLS Policies Enforce:

1. **Personal workflows** - Only creator can see
2. **Team workflows** - Only team members can see (verified via team_members table)
3. **Organization workflows** - All org members can see (verified via team membership in org)
4. **Public workflows** - Everyone can see (future feature)

### Permission Hierarchy:

```
owner (8)       - Full control, billing, can delete team
admin (7)       - Team management, can delete workflows
manager (6)     - Operational oversight
hr (5)          - People management, invitations
finance (4)     - Billing access (standalone teams)
lead (3)        - Project leadership
member (2)      - Regular contributor (default)
guest (1)       - Limited external access
```

### Key Security Functions:

```typescript
// Check access
canUserAccessWorkflow(userId, workflowId)
canUserAccessTeam(userId, teamId)
canUserAccessOrganization(userId, organizationId)

// Get permissions
getUserWorkflowPermissions(userId, workflowId) → { canView, canEdit, canDelete, ... }
getUserTeamPermissions(userId, teamId) → { canView, canEdit, canInvite, ... }

// Assert (throws if not authorized)
assertCanEditWorkflow(userId, workflowId)
assertCanDeleteWorkflow(userId, workflowId)
```

---

## 🎨 UI/UX Design Principles

### Workspace Switcher (Enhanced with 🏠 Icon)
**Purpose:** Switch context for integrations and workflow creation

**Visual Design:**
- 🏠 icon indicates "home base" concept
- Clean, simple list of available workspaces
- Does NOT show quota (that's in sidebar widget)
- Does NOT filter workflows from view

**Dropdown Content:**
```
┌────────────────────────────────────┐
│ 🏠 Personal               ✓       │
├────────────────────────────────────┤
│ 🏠 BrightSpark Marketing          │
├────────────────────────────────────┤
│ 🏠 Freelance Client A             │
└────────────────────────────────────┘
```

### Sidebar Task Widget (Updates on Workspace Switch)
**Purpose:** Display task quota for current workspace context

**Visibility Rules:**
- **Personal workspace** → Always visible (user's own quota)
- **Team/Organization workspace** → Visible only if user has billing/admin permissions
- **Team/Organization workspace (regular member)** → Hidden (no permission to see org billing)

**Visual Design (Personal):**
```
┌────────────────────────────────────┐
│ 📊 Tasks This Month               │
│    50 / 100 used            0%    │
│    [Upgrade Plan]                 │
│    [Get Free Tasks]               │
└────────────────────────────────────┘
```

**Visual Design (Organization - Admin View):**
```
┌────────────────────────────────────┐
│ 📊 Tasks This Month               │
│    450 / 10,000 used          4%  │
│    [View Billing]                 │
└────────────────────────────────────┘
```

**Visual Design (Organization - Regular Member):**
```
Widget is completely hidden - no permission to view
```

### Team Badges
- Color-coded by team (from team.color)
- Shows team name
- Clickable to filter by team
- Consistent size/style across app

### Visibility Indicators
- `[Private]` - gray badge
- `[Team]` - blue badge
- `[Organization]` - green badge
- `[Public]` - purple badge (future)

### Workflow List
```
📁 Marketing Campaigns [Marketing 🔵] [👤 Sarah] [Team]
   └── 5 workflows

📁 Shared Templates [All Teams 🟢] [👤 Admin] [Organization]
   └── 8 workflows

📁 My Drafts [Private]
   └── 2 workflows
```

### Workflow Creation Modal States

**State 1: No Default Set (First Time)**
- Shows all available workspaces with quota/integrations
- Pre-selects current workspace switcher selection
- Checkbox: "Set as my default workspace"
- Info notification on save if default is set

**State 2: Default Workspace Set**
- Compact view: "Creating in: 🏠 Personal (Default)"
- Expandable [Change ▼] button to override
- Quick workflow creation without extra clicks

**State 3: Override Default**
- Click [Change ▼] expands workspace selector
- Pre-checks "Set as my default" (will change default)
- Uncheck to create one-time in different workspace

### User Preferences (Settings Page)

**Default Workspace Behavior:**
```
┌─────────────────────────────────────────┐
│ Workflow Creation Defaults              │
│                                         │
│ ● Use default workspace:               │
│   🏠 [BrightSpark Marketing ▼]         │
│                                         │
│ ○ Ask me every time                    │
│                                         │
│ ○ Use current workspace switcher       │
│   (follows whatever is selected)       │
│                                         │
│ [Save Preferences]                      │
└─────────────────────────────────────────┘
```

**Three Modes:**
1. **Fixed Default** - Always use selected workspace (fastest)
2. **Always Ask** - Show selector every time (most control)
3. **Follow Switcher** - Use whatever workspace switcher shows (dynamic)

---

## 🧪 Testing Strategy

### Unit Tests
- Team permission calculations
- Visibility validation
- Context switching logic
- RLS policy logic (SQL tests)

### Integration Tests
- API routes with team filtering
- Workflow creation in different contexts
- Team membership changes affecting access

### E2E Tests (Playwright)
1. Personal workflow creation → only user sees it
2. Team workflow creation → team members see it, others don't
3. Organization workflow → all teams see it
4. Context switching → workflows update correctly
5. Team filter → filters work correctly
6. Permissions → users can't edit other teams' workflows

---

## 📊 Success Metrics

When complete, verify:

✅ **Functionality:**
- [ ] Users can switch between Personal, Organization, Team contexts
- [ ] Team workflows only visible to team members
- [ ] Organization workflows visible to all teams
- [ ] Private workflows only visible to creator
- [ ] Workspace switcher shows all available contexts
- [ ] Team badges appear on workflows
- [ ] Team filter works correctly
- [ ] Workflow creation respects context

✅ **Security:**
- [ ] RLS policies block unauthorized access
- [ ] API routes validate team membership
- [ ] No data leaks between teams
- [ ] Permission checks work correctly

✅ **Performance:**
- [ ] No N+1 queries (use joins)
- [ ] Queries complete in <500ms
- [ ] UI updates smoothly

✅ **Billing:**
- [ ] Organization task usage tracked correctly
- [ ] Task limits enforced at org level
- [ ] Billing page shows org usage
- [ ] Sidebar widget shows correct quota

---

## 🚀 Deployment Checklist

Before deploying to production:

1. **Database Migrations**
   - [ ] Run all migration files in order
   - [ ] Verify columns added: `team_id`, `visibility`, billing columns
   - [ ] Verify RLS policies updated
   - [ ] Verify helper functions created

2. **Data Migration**
   - [ ] Set existing workflows `visibility = 'private'`
   - [ ] Migrate workflows with organization_id to appropriate teams
   - [ ] Create default folders for team contexts

3. **Testing**
   - [ ] Run all unit tests
   - [ ] Run all integration tests
   - [ ] Run E2E tests
   - [ ] Manual QA in staging environment

4. **Documentation**
   - [ ] Update user documentation
   - [ ] Create migration guide
   - [ ] Update API documentation
   - [ ] Create video tutorial

5. **Rollout**
   - [ ] Deploy to staging
   - [ ] Beta test with 5-10 users
   - [ ] Collect feedback
   - [ ] Fix issues
   - [ ] Deploy to production
   - [ ] Monitor for errors
   - [ ] Communicate changes to users

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue: User can't see workflows after switching to organization**
- Check: Are they a member of any team in the organization?
- Check: Are workflows set to correct visibility?
- Check: RLS policies applied correctly?

**Issue: Team workflows showing to wrong users**
- Check: team_id set correctly on workflow
- Check: User is actually team member (check team_members table)
- Check: RLS SELECT policy on workflows

**Issue: Billing not tracking at org level**
- Check: organizations table has billing columns
- Check: Workflow execution service increments org tasks_used
- Check: Task limit checks use org quota, not user quota

### Debugging Queries

```sql
-- Check user's team memberships
SELECT tm.*, t.name as team_name, t.organization_id
FROM team_members tm
JOIN teams t ON t.id = tm.team_id
WHERE tm.user_id = 'user-uuid';

-- Check workflows user should see
SELECT w.id, w.name, w.visibility, w.team_id, w.organization_id
FROM workflows w
WHERE can_user_access_workflow('user-uuid', w.id);

-- Check RLS policy for user
SET ROLE authenticated;
SET request.jwt.claims.sub = 'user-uuid';
SELECT * FROM workflows; -- Should only return accessible workflows
```

---

## 🔌 Integration Management (Option B: Workspace-Scoped)

### Core Concept

**Integrations belong to workspaces, NOT to users globally.**

When you switch workspace context using the workspace switcher:
- **Personal workspace** → See/manage personal integrations only
- **Team workspace** → See team integrations (manage if admin)
- **Organization workspace** → See organization integrations (manage if admin)

### Key Rules

1. **Workspace Switcher Controls Integration Scope**
   - Current workspace determines which integrations you see
   - Cannot see team integrations when in personal workspace
   - Cannot see personal integrations when in team workspace

2. **Permission-Based Management**
   - Personal: Full control (you own it)
   - Team (member): Can USE in workflows, cannot disconnect
   - Team (admin): Can connect, disconnect, reconnect
   - Organization (member): Can USE in workflows
   - Organization (admin): Can connect, disconnect, manage

3. **Insufficient Permissions Dialog**
   - Non-admins who try to disconnect team integrations see helpful message:
     - "Ask your team admin (Alice, Bob)"
     - "Switch to Personal workspace to manage your own integrations"
     - "Switch to a team where you're admin"

4. **Workflow Builder Respects Workspace**
   - When creating workflow in "Personal" → Only personal integrations shown
   - When creating workflow in "Marketing Team" → Only team integrations shown
   - No mixing of personal/team integrations in single workflow

### Database Schema Updates

```sql
-- Add workspace context to integrations
ALTER TABLE integrations
ADD COLUMN workspace_type TEXT CHECK (workspace_type IN ('personal', 'organization', 'team')),
ADD COLUMN workspace_id UUID, -- FK to org/team ID (NULL for personal)
ADD COLUMN connected_by UUID REFERENCES auth.users(id);

-- Integration permissions table
CREATE TABLE integration_permissions (
  id UUID PRIMARY KEY,
  integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT CHECK (permission IN ('use', 'manage', 'admin')),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(integration_id, user_id)
);
```

### Implementation Priority

**Integration management is HIGH PRIORITY** and should be implemented alongside Phase 4 (UI Components):

- [ ] 4.4a - Update sidebar task widget to be workspace-aware (show/hide based on permissions)
- [ ] 4.4b - Add integration permission checks to OAuth flow
- [ ] 4.4c - Update integrations page to be workspace-aware
- [ ] 4.4d - Add "Insufficient Permissions" dialog for non-admins
- [ ] 4.4e - Update workflow builder to filter integrations by workspace

**See full details in:** `workspace-integration-management.md`

---

## ✨ Latest Updates (2025-10-28) - Sidebar Task Widget Updates

### What Changed

Based on user feedback, task quota display has been moved to the existing sidebar widget with permission-based visibility.

**Key Improvements:**

1. **🏠 Icon ("Home Base")** - Workspace switcher now shows 🏠 icon to indicate it's your "home base"

2. **Clean Workspace Switcher** - Simple dropdown with workspace names only (no quota clutter)

3. **Sidebar Task Widget Updates on Context Switch**:
   - Personal workspace → Always visible (your quota)
   - Team/Org workspace (admin) → Shows organization quota + [View Billing] button
   - Team/Org workspace (member) → **Hidden** (no permission to see billing)

4. **Default Workspace Preference** - Users can now:
   - Set a default workspace for quick workflow creation
   - Choose to be asked every time
   - Follow the workspace switcher selection
   - Override default on a per-workflow basis

5. **Smart Workflow Creation Modal** - Three scenarios:
   - **No default set**: Shows workspace selector, pre-selects switcher selection
   - **Default set**: Compact view, quick creation
   - **Override default**: Expandable [Change ▼] button

6. **Info Notifications** - When setting default, shows:
   ```
   ℹ️ Default workspace saved! New workflows will be created in
      BrightSpark Marketing. You can change this in Settings or
      uncheck the default when creating workflows.
   ```

### Database Changes Needed

**New Migration: `add_default_workspace_to_profiles.sql`**

```sql
ALTER TABLE profiles
ADD COLUMN default_workspace_id UUID,
ADD COLUMN default_workspace_type TEXT CHECK (default_workspace_type IN ('personal', 'organization', 'team')),
ADD COLUMN workflow_creation_mode TEXT DEFAULT 'ask' CHECK (workflow_creation_mode IN ('default', 'ask', 'follow_switcher'));

CREATE INDEX idx_profiles_default_workspace ON profiles(default_workspace_id);
```

### New Components/Features

**1. Enhanced WorkspaceSwitcher** (Phase 4.4)
- Shows 🏠 icon
- Clean, simple dropdown (workspace names only)
- Triggers sidebar task widget update on switch

**2. Sidebar Task Widget** (Phase 4.4a)
- Updates when workspace context changes
- Shows personal quota (always visible)
- Shows org/team quota (only if admin/billing permissions)
- Hides completely for team members without permissions
- Button changes: [Upgrade Plan] vs [View Billing] based on context

**3. WorkflowCreationModal** (Phase 4.5)
- Workspace selector (clean, no quota display)
- "Set as my default workspace" checkbox
- Collapsible workspace selector when default is set
- Info toast notification

**4. User Preferences** (Phase 4.6)
- Settings page section: "Workflow Creation Defaults"
- Three radio options: default / ask / follow switcher
- Dropdown to select default workspace

### User Benefits

✅ **Flexibility**: Set default OR ask every time OR follow switcher
✅ **Speed**: Quick workflow creation with defaults
✅ **Clarity**: Task quota shows in familiar sidebar location
✅ **Privacy**: Team members don't see billing info they shouldn't access
✅ **Control**: Easy override for one-time changes
✅ **Visibility**: Still see ALL workflows regardless of switcher
✅ **Clean UI**: Workspace switcher is simple and uncluttered

### Implementation Priority

**High Priority:**
1. Phase 1.7 - Database migration (default workspace columns)
2. Phase 4.4 - Enhanced WorkspaceSwitcher UI (clean dropdown)
3. Phase 4.4a - Sidebar Task Widget (workspace-aware + permission-based visibility)
4. Phase 4.5 - WorkflowCreationModal with defaults
5. Phase 4.6 - Settings page for default workspace

**Medium Priority:**
6. Phase 4.7 - WorkflowCard badges
7. Phase 4.8 - Folder UI updates
8. Phase 4.9 - Workflow builder team selector

---

## 🎉 Next Steps

**Ready to start implementation:**

1. **Review this master plan** - Ensure understanding of architecture
2. **Read Part 1** (`workspace-team-isolation-implementation.md`) - Database & Backend
3. **Read Part 2** (`workspace-team-isolation-implementation-part2.md`) - Frontend (partial)
4. **Start with Phase 1** - Database migrations (already designed, just need to apply)
5. **Follow checklist** - Complete each phase before moving to next
6. **Test thoroughly** - Don't skip testing phases
7. **Document as you go** - Update this guide with learnings

**Need help?** Refer back to:
- `/learning/docs/database-schema-current.md` - Current schema
- `/lib/types/roles.ts` - Role definitions
- `/lib/utils/permissions.ts` - Permission helpers

---

**Last Updated:** 2025-10-27
**Estimated Time:** 40-60 hours for full implementation
**Status:** Documentation complete, ready for implementation
