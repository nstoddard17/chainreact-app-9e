# Role System Implementation Summary

**Date**: January 26, 2025
**Status**: ✅ Core Implementation Complete

## 🎯 What Was Built

We implemented a comprehensive two-tier role system for organizations and teams with the following components:

### 1. Database Layer ✅

**New Table**: `organization_members`
- Stores organization-level roles (owner, admin, manager, hr, finance)
- Automatically migrated existing organization owners
- Full RLS policies for access control
- Indexed for performance

**Updated Table**: `team_members`
- Added new roles: manager, hr, finance, lead, guest
- Supports both standalone teams and org teams
- Maintains backward compatibility

**Files**:
- [20250126180000_create_organization_members_table.sql](supabase/migrations/20250126180000_create_organization_members_table.sql)
- [20250126180001_update_team_roles.sql](supabase/migrations/20250126180001_update_team_roles.sql)
- [ORGANIZATION_ROLES_MIGRATION.md](supabase/migrations/ORGANIZATION_ROLES_MIGRATION.md)

### 2. API Layer ✅

**New Endpoints**:
- `GET /api/organizations/[id]/members/me` - Get current user's org-level role
- `POST /api/organizations/[id]/members` - Add org-level member

**Updated Endpoints**:
- `GET /api/organizations/[id]/members` - Now includes org-level members

**Files**:
- [app/api/organizations/[id]/members/me/route.ts](app/api/organizations/[id]/members/me/route.ts)
- [app/api/organizations/[id]/members/route.ts](app/api/organizations/[id]/members/route.ts) (updated)

### 3. Permission System ✅

**Helper Functions**:
- `hasOrgPermission()` - Check org-level role
- `hasTeamPermission()` - Check team-level role
- `canManageBilling()` - Smart billing permission check (handles standalone vs org teams)
- `isOrgMember()` - Check if user is org member
- `getOrgRole()` / `getTeamRole()` - Get user's role
- `canManageOrgSettings()` / `canManageTeamSettings()` - Settings permission
- `canInviteOrgMembers()` / `canInviteTeamMembers()` - Invitation permission

**Files**:
- [lib/utils/permissions.ts](lib/utils/permissions.ts)

### 4. Type System ✅

**TypeScript Types**:
- `OrgRole` - Type-safe org roles
- `TeamRole` - Type-safe team roles
- `OrganizationMember` / `TeamMember` - Interface definitions
- Role descriptions, permissions, and hierarchy

**Files**:
- [lib/types/roles.ts](lib/types/roles.ts)

### 5. UI Updates ✅

**Sidebar**:
- Now checks `organization_members` table
- "Team Settings" only shows if user has admin/owner role in any team
- "Organization Settings" only shows if user has admin/owner role in any organization

**Files**:
- [components/new-design/layout/NewSidebar.tsx](components/new-design/layout/NewSidebar.tsx) (updated)

## 📋 Role Structure

### 🏢 Organization-Level Roles

| Role | Who Has It | What They Can Do |
|------|-----------|------------------|
| `owner` | 1 person | Everything (billing, delete org, transfer ownership) |
| `admin` | Multiple people | Manage teams, users, settings (cannot delete org) |
| `manager` | Multiple people | Day-to-day operations, view analytics |
| `hr` | Multiple people | User onboarding/offboarding, invitations |
| `finance` | Multiple people | Billing, subscriptions, usage costs |

**No "member" role**: Users are org members by having an org-level role OR being in a team.

### 👥 Team-Level Roles

| Role | Standalone Teams | Org Teams |
|------|------------------|-----------|
| `owner` | Full control + billing | Full control (no billing) |
| `admin` | Manage team + view billing | Manage team |
| `manager` | Operations only | Operations only |
| `hr` | People management | People management |
| `finance` | Billing access | No billing (org-level) |
| `lead` | Project leadership | Project leadership |
| `member` | Regular contributor | Regular contributor |
| `guest` | Limited access | Limited access |

## 🔐 Key Design Decisions

### 1. No Org-Level "Member" Role
Users are members of an organization by:
- Having an org-level role (owner, admin, manager, hr, finance), OR
- Being a member of at least one team within the organization

### 2. Billing Logic
- **Standalone teams**: Team owner/admin/finance can manage billing
- **Org teams**: Org owner/admin/finance handle billing

### 3. Role Inheritance
- Org-level roles do NOT automatically grant team-level access
- Users must be explicitly added to teams
- Exception: Org owners/admins typically should have visibility (implement in UI)

## 🚀 Next Steps (Not Yet Implemented)

### 1. Role Management UI 🔴 TODO

Build interfaces for:
- **Organization Settings** → "Members" tab
  - List all org-level members
  - Add new org-level members
  - Change org-level roles
  - Remove org-level members
  - Transfer ownership

- **Team Settings** → Enhanced member management
  - Show both team role AND org role (if user has both)
  - Allow team admins to manage team roles
  - Prevent conflicts (e.g., can't demote someone with higher org role)

**Suggested Location**:
- `components/organizations/OrganizationMembersManager.tsx` (new)
- Update `components/new-design/OrganizationSettingsContent.tsx`
- Update `components/new-design/TeamSettingsContent.tsx`

### 2. Middleware Protection 🔴 TODO

Add route-level permission checks:

```typescript
// middleware.ts or individual API routes
import { hasOrgPermission } from '@/lib/utils/permissions'

export async function middleware(request: NextRequest) {
  // Protect org settings routes
  if (request.nextUrl.pathname.startsWith('/organization-settings')) {
    const user = await getUser(request)
    const orgId = await getCurrentOrgId(request)

    if (!await hasOrgPermission(user.id, orgId, ['owner', 'admin'])) {
      return NextResponse.redirect('/unauthorized')
    }
  }

  return NextResponse.next()
}
```

### 3. Audit Logging 🔴 TODO

Track role changes:
- Who added/removed whom
- Role changes
- Permission grants/revocations

**Suggested Table**:
```sql
CREATE TABLE organization_audit_log (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  actor_user_id UUID REFERENCES auth.users(id),
  action TEXT, -- 'member_added', 'role_changed', 'member_removed'
  target_user_id UUID REFERENCES auth.users(id),
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4. Invitation System 🔴 TODO

Allow inviting users who don't have accounts yet:
- Send email invitations
- Track pending invitations
- Auto-assign role when they sign up

### 5. Role-Based UI Components 🔴 TODO

Create reusable components:

```typescript
// components/auth/RequireOrgRole.tsx
<RequireOrgRole orgId={orgId} roles={['owner', 'admin']}>
  <DangerZone />
</RequireOrgRole>

// components/auth/RequireTeamRole.tsx
<RequireTeamRole teamId={teamId} roles={['owner', 'admin']}>
  <TeamSettings />
</RequireTeamRole>
```

## 📖 Usage Examples

### Check Permissions in API Route

```typescript
import { hasOrgPermission } from '@/lib/utils/permissions'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser(req)

  // Only org owners can delete
  if (!await hasOrgPermission(user.id, params.id, ['owner'])) {
    return errorResponse('Unauthorized', 403)
  }

  // Proceed with deletion...
}
```

### Check Billing Permissions

```typescript
import { canManageBilling } from '@/lib/utils/permissions'

export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const user = await getUser(req)

  // Automatically handles standalone vs org teams
  if (!await canManageBilling(user.id, params.teamId)) {
    return errorResponse('You cannot manage billing for this team', 403)
  }

  // Update subscription...
}
```

### Use Types in Components

```typescript
import { OrgRole, ORG_ROLE_DESCRIPTIONS } from '@/lib/types/roles'

function RoleSelector({ currentRole, onChange }: { currentRole: OrgRole, onChange: (role: OrgRole) => void }) {
  return (
    <Select value={currentRole} onValueChange={onChange}>
      {(['owner', 'admin', 'manager', 'hr', 'finance'] as OrgRole[]).map(role => (
        <SelectItem key={role} value={role}>
          <div>
            <div className="font-medium">{role}</div>
            <div className="text-xs text-muted-foreground">
              {ORG_ROLE_DESCRIPTIONS[role]}
            </div>
          </div>
        </SelectItem>
      ))}
    </Select>
  )
}
```

## ✅ Testing Checklist

- [x] Database migrations applied successfully
- [x] Org owners migrated to organization_members table
- [x] API endpoints return org-level roles
- [x] Sidebar conditionally shows settings links
- [ ] Role management UI (not yet built)
- [ ] Permission checks on all protected routes
- [ ] Audit logging
- [ ] Invitation system

## 🐛 Known Issues / Limitations

1. **No UI for role management yet** - Users can't assign org-level roles through the UI
2. **No invitation system** - Can only add existing users
3. **No audit logging** - Role changes aren't tracked
4. **No middleware protection** - Routes rely on component-level checks
5. **Org owners should probably auto-see all teams** - Current implementation requires explicit team membership

## 📚 Additional Resources

- [Migration Documentation](supabase/migrations/ORGANIZATION_ROLES_MIGRATION.md)
- [Permission Helper Functions](lib/utils/permissions.ts)
- [Type Definitions](lib/types/roles.ts)

## 🙋 Questions?

For implementation questions or clarifications, see the detailed migration guide or role type definitions.
