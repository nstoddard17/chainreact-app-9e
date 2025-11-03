# Leave Team/Organization Implementation

## Overview
Implemented comprehensive "Leave Team" functionality allowing users to voluntarily leave teams with proper edge case handling, activity logging, and organization member synchronization.

**Date**: November 3, 2025
**Related Issues**: Team lifecycle management, organization members table

---

## What Was Implemented

### 1. Database Schema

**File**: `supabase/migrations/20251103000006_create_organization_members_and_leave_functionality.sql`

#### Organization Members Table
```sql
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner', 'admin', 'manager', 'hr', 'finance')),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(organization_id, user_id)
)
```

**Purpose**: Track organization-level membership separate from team membership. Users can be in multiple teams within an organization.

**Roles**:
- `owner` - Organization owner (highest privileges)
- `admin` - Organization admin
- `manager` - Default role when joining via team
- `hr` - HR role for people management
- `finance` - Finance role for billing/subscriptions

#### Database Triggers

**1. Sync Team Members to Organization**
```sql
CREATE TRIGGER sync_team_members_to_org_trigger
  AFTER INSERT ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION sync_team_members_to_org()
```
- **When**: User joins a team that belongs to an organization
- **Action**: Automatically adds user to `organization_members` with 'manager' role
- **Idempotent**: Uses `ON CONFLICT DO NOTHING` to prevent duplicates

**2. Cleanup Organization Members**
```sql
CREATE TRIGGER cleanup_org_member_trigger
  AFTER DELETE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_org_member_if_no_teams()
```
- **When**: User leaves a team in an organization
- **Action**: Removes from `organization_members` IF:
  - User is not in any other teams in the org
  - User's role is NOT 'owner' or 'admin' (preserves org-level roles)

**3. Log Member Left**
```sql
CREATE TRIGGER log_member_left_trigger
  AFTER DELETE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION log_member_left()
```
- **When**: User leaves a team
- **Action**: Logs "member_left" activity with user email, role, and team name

**4. Auto-Delete Team**
```sql
CREATE TRIGGER delete_team_if_last_member_trigger
  AFTER DELETE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION delete_team_if_last_member()
```
- **When**: Last member leaves a team
- **Checks**:
  - No remaining members (`COUNT(*) = 0`)
  - Leaving user is the team owner/creator
- **Action**: Deletes the team (cascades to workflows, folders, etc.)

---

### 2. API Endpoints

#### DELETE `/api/teams/[id]/members/[userId]`

**File**: `app/api/teams/[id]/members/[userId]/route.ts`

**Updated Logic**:
```typescript
const isSelfRemoval = user.id === userId

if (isSelfRemoval) {
  // User leaving voluntarily
  if (targetMember.role === 'owner') {
    // Check if other members exist
    if (memberCount > 1) {
      return errorResponse(
        "Team owners must transfer ownership before leaving",
        403
      )
    }
    // If last member, allow (triggers auto-deletion)
  }
} else {
  // Admin removing another user
  // Existing permission checks...
}
```

**Behavior**:
- **Self-removal** (user leaving):
  - ✅ Non-owners: Can leave anytime
  - ✅ Owner (last member): Can leave → triggers team deletion
  - ❌ Owner (with other members): Must transfer ownership first

- **Admin removal** (kicking someone):
  - ✅ Owners/admins/managers can remove members
  - ❌ Cannot remove team owner
  - ❌ Non-admins cannot remove anyone

#### POST `/api/teams/[id]/transfer-ownership`

**File**: `app/api/teams/[id]/transfer-ownership/route.ts`

**New Endpoint** for owners to transfer team ownership before leaving.

```typescript
POST /api/teams/{team-id}/transfer-ownership
Body: { new_owner_id: "uuid" }
```

**Process**:
1. Verify current user is owner
2. Verify new owner is team member
3. Update new owner → 'owner' role
4. Downgrade current owner → 'admin' role
5. Update `teams.created_by` to new owner
6. Log "member_role_changed" activity

---

### 3. UI Components

#### TeamDetailContent - Leave Team UI

**File**: `components/teams/TeamDetailContent.tsx`

**Added Components**:

1. **Danger Zone Card**
```tsx
<Card className="border-red-200 dark:border-red-900">
  <CardHeader>
    <CardTitle className="text-red-600 dark:text-red-400">
      Danger Zone
    </CardTitle>
  </CardHeader>
  <CardContent>
    <Button
      variant="destructive"
      onClick={() => setLeaveDialogOpen(true)}
      disabled={!canLeaveTeam}
    >
      <LogOut className="w-4 h-4 mr-2" />
      Leave Team
    </Button>
  </CardContent>
</Card>
```

2. **Leave Confirmation Dialog**
```tsx
<Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Leave {team.name}?</DialogTitle>
      <DialogDescription>
        {/* Context-aware message based on role */}
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button variant="destructive" onClick={handleLeaveTeam}>
        {leaving ? "Leaving..." : "Leave Team"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**State Management**:
```typescript
const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
const [leaving, setLeaving] = useState(false)
const [currentUserId, setCurrentUserId] = useState<string>("")

const isOwner = userRole === 'owner'
const canLeaveTeam = !isOwner || memberCount === 1
```

**Dialog Messages**:

*For owner (last member)*:
> ⚠️ Warning: This will permanently delete the team
>
> As the last member and owner, leaving this team will permanently delete it along with:
> - All team workflows
> - All team folders
> - All team activity history
> - All team settings
>
> This action cannot be undone.

*For regular members*:
> You will be removed from this team and will lose access to:
> - Team workflows
> - Team folders
> - Team activity
> - Team settings
>
> You can be re-invited by a team admin or owner.

---

## Edge Cases Handled

### 1. Owner with Other Members
**Scenario**: Team owner tries to leave when other members exist

**Behavior**:
- ❌ Leave button is **disabled**
- ⚠️ Message: "You must transfer ownership before leaving this team"
- 🔄 Owner must use Transfer Ownership feature first

**Why**: Prevents orphaned teams with no owner

### 2. Owner as Last Member
**Scenario**: Team owner is the only remaining member and leaves

**Behavior**:
- ✅ Leave is allowed
- 🗑️ Team is automatically deleted
- 🗑️ Cascades: workflows, folders, activity, invitations
- 📝 Activity logged before deletion

**Why**: No point keeping an empty team

### 3. Organization Member Cleanup
**Scenario**: User leaves their only team in an organization

**Behavior**:
- 🔍 Check if user is in other teams in same org
- ❌ If no other teams → Remove from `organization_members`
- ✅ If has org-level role (owner/admin) → **Keep** in `organization_members`

**Why**: Org owners/admins maintain access even without team membership

### 4. Activity Logging
**Scenario**: User leaves team

**Behavior**:
- 📝 Log created in `team_activity` table
- 📧 Includes user email, role, team name
- 🕐 Timestamp recorded
- 👥 Visible to remaining team members in Activity Feed

**Why**: Audit trail for team changes

---

## Data Migration

### Backfill Process

**What it does**: Migrates existing data to new schema

```sql
-- Step 1: Migrate organization owners
INSERT INTO organization_members (organization_id, user_id, role, created_at)
SELECT id, owner_id, 'owner', created_at
FROM organizations
WHERE owner_id IS NOT NULL

-- Step 2: Backfill team members to org members
INSERT INTO organization_members (organization_id, user_id, role, created_at)
SELECT DISTINCT
  t.organization_id,
  tm.user_id,
  'manager',
  tm.joined_at
FROM team_members tm
JOIN teams t ON t.id = tm.team_id
WHERE t.organization_id IS NOT NULL
```

**Safe to re-run**: Uses `ON CONFLICT DO NOTHING`

---

## Testing Checklist

### Test Scenarios

- [ ] **Regular member leaves**
  - Member clicks "Leave Team"
  - Confirmation dialog appears
  - After leaving, redirected to `/teams`
  - Activity logged as "member_left"
  - Member no longer in team_members table

- [ ] **Owner leaves (with other members)**
  - Leave button is disabled
  - Message shows must transfer ownership
  - Cannot proceed until ownership transferred

- [ ] **Owner leaves (last member)**
  - Leave button is enabled
  - Warning dialog shows "This will delete the team"
  - After leaving:
    - Team is deleted
    - Workflows deleted
    - Folders deleted
    - Activity history deleted
    - Redirected to `/teams`

- [ ] **Organization member sync**
  - User joins team in org A → Added to org_members
  - User leaves team → Check if other teams in org A
  - If no other teams → Removed from org_members
  - If other teams exist → Stays in org_members
  - If org-level role → Always stays in org_members

- [ ] **Transfer ownership**
  - Owner initiates transfer
  - New owner receives 'owner' role
  - Previous owner downgraded to 'admin'
  - Activity logged
  - Previous owner can now leave

---

## Database Schema Reference

### Tables Created/Modified

**organization_members** (NEW)
- `id` - UUID primary key
- `organization_id` - FK to organizations
- `user_id` - FK to auth.users
- `role` - Enum: owner, admin, manager, hr, finance
- `created_at`, `updated_at` - Timestamps
- Unique constraint: (organization_id, user_id)

### Functions Created

1. `sync_team_members_to_org()` - Adds team members to org
2. `cleanup_org_member_if_no_teams()` - Removes from org when leaving all teams
3. `log_member_left()` - Logs leave activity
4. `delete_team_if_last_member()` - Auto-deletes empty teams

### Indexes Added

- `idx_organization_members_org_id` - Fast org lookups
- `idx_organization_members_user_id` - Fast user lookups
- `idx_organization_members_role` - Role filtering

### RLS Policies

- **SELECT**: Organization members can view other members
- **INSERT**: Org owners/admins/hr can add members
- **UPDATE**: Org owners/admins can update members
- **DELETE**: Org owners/admins can remove members

---

## Migration Issues Encountered

### Issue 1: Column `joined_at` does not exist
**Symptom**: Migration failed with column not found error

**Cause**: Table defined `created_at` and `updated_at`, but INSERT used `joined_at`

**Fix**: Removed `joined_at` column, used `created_at` consistently

### Issue 2: Column `created_by` does not exist
**Symptom**: Migration failed when backfilling organization owners

**Cause**: Organizations table uses `owner_id`, not `created_by`

**Fix**: Updated query to use `owner_id` instead

```sql
-- BEFORE (wrong)
SELECT id, created_by, 'owner', created_at
FROM organizations

-- AFTER (correct)
SELECT id, owner_id, 'owner', created_at
FROM organizations
WHERE owner_id IS NOT NULL
```

---

## Future Enhancements

### Transfer Ownership UI
Currently only API endpoint exists. Need to add:
- Button in team settings for owners
- Modal to select new owner from team members
- Confirmation step
- Success notification

### Leave Organization
Similar functionality for leaving organizations:
- Check if user is in any teams
- Prevent org owner from leaving
- Cascade cleanup of team memberships

### Bulk Operations
- Remove multiple members at once
- Transfer multiple teams to new organization
- Export team member list

---

## Related Documentation

- `/learning/docs/action-trigger-implementation-guide.md` - Trigger patterns
- `/learning/walkthroughs/team-detail-page-fix.md` - Team page implementation
- `/learning/walkthroughs/team-activity-implementation.md` - Activity logging

---

## Summary

The Leave Team feature is now fully implemented with:

✅ Database schema with organization_members table
✅ Four database triggers for sync, cleanup, logging, and deletion
✅ Updated DELETE API endpoint supporting self-removal
✅ New Transfer Ownership API endpoint
✅ UI with Danger Zone card and confirmation dialog
✅ Context-aware messaging based on role and member count
✅ Edge case handling (owner with members, last member, org sync)
✅ Activity logging for audit trail
✅ Data migration for existing teams and organizations

**All code is in place and migration has been successfully applied.**
