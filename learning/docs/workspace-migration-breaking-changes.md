# Workspace Migration - Breaking Changes Analysis

**Date**: January 26, 2025
**Status**: Analysis Phase

## Schema Changes Summary

### New Tables
1. **`workspaces`** - Personal workspaces only (one per user)
2. **`workspace_members`** - Members of personal workspaces

### Modified Tables
1. **`organizations`** - Remove `is_personal`, add reference to workspace for org-level data
2. **`teams`** - Add `workspace_id` for standalone teams (NULL if in organization)
3. **`workflows`** - Replace `organization_id` with `workspace_id`

### Deleted Tables
1. **`organization_members`** - Replaced by team_members for org access

### Tables Needing `organization_id` → `workspace_id` Migration
From database.types.ts analysis, **40+ tables** reference `organization_id`:
- `advanced_integrations`
- `ai_workflow_generations`
- `analytics_metrics`
- `api_keys`
- `api_usage_logs`
- `audit_logs`
- `automated_reports`
- `backup_recovery_logs`
- `compliance_audit_logs`
- `custom_api_connectors`
- `custom_code_libraries`
- `custom_dashboards`
- `custom_integrations`
- `data_subject_requests`
- `database_connections`
- `deployment_configurations`
- (see full list in types/database.types.ts)

**Decision needed**: Should these reference `workspace_id` or keep `organization_id`?
- Most should probably use `workspace_id` (works for personal, team, org)
- Some might need to stay org-specific (billing, compliance)

---

## API Routes - Breaking Changes

### 🔴 MAJOR BREAKING CHANGES (Delete/Rewrite Required)

#### 1. `/api/organizations/[id]/members/` routes
**Files**:
- `app/api/organizations/[id]/members/route.ts`
- `app/api/organizations/[id]/members/[memberId]/route.ts`

**Current**: Direct organization membership via `organization_members` table
**New**: Organization membership determined by team membership
**Changes Required**:
- GET members: Query all users in teams within organization
- POST member: Must specify which team to add them to (or create default team)
- DELETE member: Remove from all teams in organization
- PUT role: Update role in specific team

**Breaking**: API contract changes - need team_id parameter for adding members

#### 2. `/api/organizations/[id]/invitations/` routes
**Files**:
- `app/api/organizations/[id]/invitations/route.ts`
- `app/api/organizations/[id]/invite/route.ts`

**Current**: Invite to organization directly
**New**: Invite to team within organization
**Changes Required**:
- Add `team_id` parameter to invitation
- Update invitation acceptance to add user to team
- Create `organization_invitations` pointing to team

**Breaking**: Invitation structure changes, requires team_id

#### 3. `/api/workflows/[id]/move-to-organization/route.ts`
**Current**: Move workflow to organization
**New**: Move workflow to workspace (personal/team/org)
**Changes Required**:
- Rename to `/api/workflows/[id]/move-to-workspace/`
- Accept workspace_id instead of organization_id
- Handle workspace type validation

**Breaking**: Endpoint URL and parameter names change

### 🟡 MODERATE CHANGES (Update Logic)

#### 4. `/api/organizations/route.ts`
**Changes**:
- POST: Create organization + workspace + default team in transaction
- GET: Join workspace data, return is_personal from workspace type
- Check organization access via team membership instead of organization_members

#### 5. `/api/organizations/[id]/route.ts`
**Changes**:
- GET: Join workspace data
- PUT: Update both organization and workspace records
- DELETE: Cascade delete workspace, teams, and members
- Access check: User must be in a team within org

#### 6. `/api/organizations/[id]/teams/route.ts`
**Changes**:
- POST: Set organization_id when creating team
- Validate user is org admin (check via team membership)

#### 7. `/api/teams/route.ts`
**Changes**:
- POST: Support creating standalone team (with workspace_id) OR org team (with organization_id)
- GET: Return both standalone and org teams for user

#### 8. `/api/teams/[id]/members/route.ts`
**Changes**:
- Validate organization access via team membership
- Update member count queries

#### 9. `/api/workflows/route.ts`
**Changes**:
- POST: Set workspace_id instead of organization_id
- GET: Filter by workspace_id
- Update RLS policies to check workspace access

#### 10. `/api/workflows/folders/route.ts`
**Changes**:
- Update to use workspace_id instead of organization_id

### 🟢 MINOR CHANGES (Query Updates)

#### 11. All other organization-referencing routes
**Files**:
- `app/api/invitations/accept/route.ts`
- `app/api/invitations/validate/route.ts`
- `app/api/test-rls/route.ts`
- `app/api/admin/users/delete/route.ts`

**Changes**: Update queries to use new schema

---

## UI Components - Breaking Changes

### 🔴 MAJOR CHANGES (Rewrite Required)

#### 1. Organization Settings Page
**File**: `components/new-design/OrganizationSettingsContent.tsx`

**Current Issues**:
- Fetches organization members from `organization_members`
- Shows member list with direct org roles

**Required Changes**:
- Fetch all teams in organization
- Show members grouped by team
- Add members by selecting team
- Update "Members" tab to show team-based structure

#### 2. Organization Switcher
**File**: `components/new-design/OrganizationSwitcher.tsx`

**Current Issues**:
- Lists organizations user is directly member of
- Uses `organization_members` table

**Required Changes**:
- Query user's workspaces (personal + teams)
- Group by workspace type (personal, team, org)
- Show "Personal Workspace", "Teams", "Organizations" sections
- Update localStorage to store `current_workspace_id`

#### 3. Create Organization Dialog
**File**: `components/teams/CreateOrganizationDialog.tsx`

**Required Changes**:
- Create workspace + organization + default team in one flow
- Ask for default team name during creation
- Add user as owner of workspace and admin of default team

#### 4. Member Management
**File**: `components/teams/MemberManagement.tsx`

**Current Issues**:
- Manages `organization_members` directly

**Required Changes**:
- Show team-based member structure
- Add "Select Team" dropdown when adding members
- Remove members from specific teams or all teams
- Update to use team_members queries

#### 5. Add to Organization Dialog
**File**: `components/workflows/AddToOrganizationDialog.tsx`

**Required Changes**:
- Rename to "Add to Workspace Dialog"
- Support moving to personal workspace, team, or organization
- Update to use workspace_id instead of organization_id

### 🟡 MODERATE CHANGES (Logic Updates)

#### 6. Workflows Page
**File**: `components/workflows/WorkflowsPageContent.tsx`

**Changes**:
- Filter by workspace_id instead of organization_id
- Update workspace switcher integration
- Handle personal/team/org workspace types

#### 7. Team Content
**Files**:
- `components/new-design/TeamContent.tsx`
- `components/teams/TeamManagement.tsx`
- `components/teams/TeamsContent.tsx`

**Changes**:
- Support standalone teams (workspace_id) and org teams (organization_id)
- Show workspace type indicator
- Update team creation to support both types

#### 8. Organization Content
**File**: `components/teams/OrganizationContent.tsx`

**Changes**:
- Fetch organization via workspace
- Update all queries to use new schema

#### 9. Sidebar/Navigation
**Files**:
- `components/new-design/layout/NewSidebar.tsx`
- `components/new-design/layout/NewHeader.tsx`

**Changes**:
- Update workspace switcher
- Show workspace type in UI
- Update context/state management

#### 10. Workflow Header
**File**: `components/workflows/builder/WorkflowHeader.tsx`

**Changes**:
- Display workspace name instead of organization name
- Update sharing logic for workspace-based access

### 🟢 MINOR CHANGES (Display/Text Updates)

#### 11. Various UI Components
**Files**: (Multiple components with minor org references)
- Update display text from "organization" to "workspace" where appropriate
- Update tooltips and help text
- Update form labels

---

## Stores/State Management

### `authStore.ts` (if it tracks current org)
**Changes**:
- Replace `currentOrganization` with `currentWorkspace`
- Update initialization to fetch workspace instead of organization

### `workflowStore.ts`
**Changes**:
- Update queries to use workspace_id
- Update filtering/scoping logic

### LocalStorage Keys
**Changes**:
- `current_organization_id` → `current_workspace_id`
- Update all references in codebase

---

## Database Indexes & RLS Policies

### New Indexes Required
```sql
CREATE INDEX idx_workspaces_owner_id ON workspaces(owner_id);
CREATE INDEX idx_workspace_members_workspace_id ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX idx_teams_workspace_id ON teams(workspace_id);
CREATE INDEX idx_teams_organization_id ON teams(organization_id);
```

### RLS Policies to Update
- `workflows` - Check workspace access instead of organization access
- `teams` - Handle both workspace_id and organization_id cases
- All tables with organization_id - Update to workspace_id

### RLS Policies to Create
```sql
-- Workspaces (personal only)
CREATE POLICY "Users can view own workspace"
  ON workspaces FOR SELECT
  USING (owner_id = auth.uid());

-- Workspace members
CREATE POLICY "Users can view workspace if member"
  ON workspace_members FOR SELECT
  USING (user_id = auth.uid() OR workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));
```

---

## Data Migration Critical Path

### Phase 1: Schema Changes (Non-Breaking)
1. Create `workspaces` table
2. Create `workspace_members` table
3. Add `workspace_id` to `teams` (nullable)
4. Add `workspace_id` to `workflows` (nullable)

### Phase 2: Data Migration
1. Migrate personal organizations to workspaces
2. Create workspaces for real organizations
3. Update teams to reference organizations correctly
4. Migrate workflows to use workspace_id
5. Create workspace_members from organization ownership

### Phase 3: Breaking Schema Changes
1. Drop `organization_members` table
2. Make workspace_id NOT NULL on workflows
3. Remove `is_personal` from organizations
4. Remove `organization_id` from workflows

### Phase 4: Code Updates
1. Update API routes (can do incrementally)
2. Update UI components (can do incrementally)
3. Update RLS policies
4. Update tests

---

## Rollback Strategy

### Before Breaking Changes
- All schema changes in Phase 1-2 are additive (can rollback)
- Keep old columns until code is updated

### Point of No Return
- Dropping `organization_members` table
- Removing `organization_id` from workflows

### Rollback Plan
1. Restore database from backup before Phase 3
2. Revert code changes via git
3. Run reverse migration scripts (to be created)

---

## Testing Requirements

### Data Integrity Tests
- [ ] Personal workspaces: All users have exactly one
- [ ] Organization ownership: All orgs have owner in a team
- [ ] Workflow access: No orphaned workflows
- [ ] Team membership: All org members in at least one team

### Functionality Tests
- [ ] Create personal workspace (auto on signup)
- [ ] Create organization with default team
- [ ] Create standalone team
- [ ] Add member to team (in org)
- [ ] Add member to standalone team
- [ ] Move workflow between workspaces
- [ ] Delete organization (cascades correctly)
- [ ] Access control (workspace/team/org levels)

### Migration Tests
- [ ] All personal orgs migrated to workspaces
- [ ] All real orgs have workspaces
- [ ] All teams correctly linked
- [ ] All workflows correctly linked
- [ ] No data loss
- [ ] Member counts match

---

## Estimated Impact

### Database
- **Tables Modified**: 6 (workspaces, organizations, teams, workflows, workspace_members, workflows)
- **Tables Deleted**: 1 (organization_members)
- **Tables Created**: 2 (workspaces, workspace_members)
- **Tables Needing Review**: 40+ (organization_id references)

### API Routes
- **Breaking Changes**: 3 major routes (members, invitations, move-to-org)
- **Moderate Changes**: 8 routes
- **Minor Changes**: 10+ routes

### UI Components
- **Major Rewrites**: 5 components (settings, switcher, dialogs, member mgmt)
- **Moderate Updates**: 10 components
- **Minor Updates**: 30+ components

### Estimated Timeline
- **Schema Design & Review**: 1 day ✅ (done)
- **Breaking Changes Analysis**: 0.5 days ✅ (done)
- **SQL Migrations**: 2-3 days
- **API Route Updates**: 3-5 days
- **UI Component Updates**: 5-7 days
- **Testing & QA**: 3-5 days
- **Deployment & Monitoring**: 1-2 days

**Total**: 15-23 days of development work

---

## Risk Assessment

### High Risk ⚠️
- Data migration (personal orgs → workspaces)
- Dropping organization_members table
- Breaking API changes (need versioning?)
- User confusion during transition

### Medium Risk ⚠️
- Performance impact of new queries
- RLS policy complexity
- Testing coverage gaps
- Rollback complexity after Phase 3

### Low Risk ✓
- Schema design is solid
- Clear separation of concerns
- Incremental migration possible
- Good documentation

---

## Recommendations

### Must Do
1. **Create staging environment clone** - Test migration on real data
2. **API versioning** - Consider /v2/ endpoints for breaking changes
3. **Feature flags** - Toggle between old/new schema during transition
4. **Monitoring** - Add metrics for workspace queries, errors
5. **User communication** - Notify users of changes, migration timeline

### Should Do
1. **Gradual rollout** - Migrate users in batches
2. **Parallel run** - Keep both schemas for a period
3. **Automated tests** - High coverage before migration
4. **Documentation** - Update all docs, API specs

### Nice to Have
1. **Migration dashboard** - Track progress, issues
2. **Rollback automation** - One-click revert
3. **Performance benchmarks** - Before/after comparison
