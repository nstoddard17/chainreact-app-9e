# Organization Settings Component Migration Plan

## Changes Needed

### 1. Remove `is_personal` references
- **Old**: Check `organization.is_personal`
- **New**: Organizations don't have personal workspaces anymore
- **Action**: Remove personal workspace warning card

### 2. Update member fetching to be team-based
- **Old**: Fetch from `/api/organizations/[id]/members` (direct org members)
- **New**: Fetch all teams in org, then show members grouped by team
- **Action**:
  - Fetch teams from `/api/organizations/[id]/teams`
  - Each team includes its members
  - Display members grouped by team

### 3. Update localStorage key
- **Old**: `current_organization_id`
- **New**: `current_workspace_id`
- **Action**: Update all localStorage references

### 4. Update member display
- **Old**: Flat list of organization members
- **New**: Members grouped by team with team context
- **Structure**:
  ```
  Team: Engineering (5 members)
    - John Doe (admin)
    - Jane Smith (member)

  Team: Marketing (3 members)
    - Bob Johnson (admin)
    - Alice Williams (member)
  ```

### 5. Update "Add Member" flow
- **Old**: Add directly to organization
- **New**: Require team selection when adding members
- **Action**: Add team selector in invite dialog

## Implementation Order

1. ✅ Remove `is_personal` checks and UI
2. ✅ Update localStorage to use workspace_id
3. ✅ Change members tab to show team-grouped members
4. ✅ Update invite flow to require team selection
5. ✅ Test all functionality

## API Routes to Update Next

After fixing the component, these API routes need updates:
- `/api/organizations/[id]/members/` - Return team-grouped members
- `/api/organizations/[id]/invitations/` - Require team_id parameter
