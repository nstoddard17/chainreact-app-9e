# Role System Implementation

## Overview

A comprehensive role-based access control (RBAC) system has been implemented for the ChainReact application with the following roles:

- **Free**: Basic features for individual users
- **Pro**: Advanced features for power users  
- **Business**: Team collaboration and advanced features
- **Enterprise**: Full enterprise features and support
- **Admin**: Full system access and privileges

## Database Changes

### New Column Added
- `role` column in `user_profiles` table with values: 'free', 'pro', 'business', 'enterprise', 'admin'
- Default value: 'free'
- Constraint: CHECK (role IN ('free', 'pro', 'business', 'enterprise', 'admin'))

### SQL Script
Run the following script in your Supabase database:
```sql
-- Located at: scripts/add-role-column.sql
```

This script:
1. Adds the role column to user_profiles table
2. Sets existing users 'nstoddard17' and 'DaBoss' as admin
3. Sets all other users to 'free' role
4. Creates role-based permissions function
5. Adds RLS policies for role-based access

## Components Created

### 1. Role Utilities (`lib/utils/roles.ts`)
- Role definitions with features, limits, and styling
- Permission checking functions
- Role hierarchy management

### 2. Role Badge Components (`components/ui/role-badge.tsx`)
- `RoleBadge`: Full role badge with icon and text
- `RoleBadgeCompact`: Compact role indicator for headers

### 3. Role Restriction Components (`components/ui/role-restriction.tsx`)
- `RoleRestriction`: Shows feature restrictions for insufficient roles
- `RoleUpgradePrompt`: Displays upgrade options with feature comparison

### 4. Admin Components
- `UserRoleManagement`: Admin interface for managing user roles
- Admin page at `/admin` with role management capabilities

### 5. Role Permissions Hook (`hooks/use-role-permissions.ts`)
- Easy-to-use hook for role-based logic throughout the app
- Common permission checks and feature access

## Updated Components

### Header Components
- **TopBar**: Shows user role badge next to username
- **PublicLayout**: Displays role badge in navigation
- **LandingPage**: Role badge in user dropdown

### Navigation
- **Sidebar**: Admin navigation section for admin users
- Admin panel link with crown icon

### Authentication
- **AuthStore**: Updated to fetch and store role information
- Profile queries now include role field

## Role Features & Limits

### Free Plan
- Up to 3 workflows
- Basic integrations (5)
- 100 executions per month
- Email support

### Pro Plan
- Up to 20 workflows
- Advanced integrations (15)
- 1,000 executions per month
- Priority support
- Custom templates

### Business Plan
- Unlimited workflows
- Team collaboration
- Advanced analytics
- API access
- Dedicated support
- 50 integrations
- 10,000 executions per month

### Enterprise Plan
- Everything in Business
- Custom integrations
- SLA guarantees
- On-premise deployment
- 24/7 support
- Unlimited integrations
- Unlimited executions

### Admin Role
- All features and privileges
- User management
- System administration
- Full access to all data

## Usage Examples

### Basic Role Checking
```typescript
import { useRolePermissions } from '@/hooks/use-role-permissions'

function MyComponent() {
  const { userRole, isAdmin, hasPermission } = useRolePermissions()
  
  if (isAdmin) {
    return <AdminOnlyContent />
  }
  
  if (hasPermission('pro')) {
    return <ProFeature />
  }
  
  return <BasicFeature />
}
```

### Feature Restrictions
```typescript
import { RoleRestriction } from '@/components/ui/role-restriction'

function AdvancedFeature() {
  return (
    <RoleRestriction requiredRole="pro" feature="Advanced Analytics">
      <AdvancedAnalyticsComponent />
    </RoleRestriction>
  )
}
```

### Role Badge Display
```typescript
import { RoleBadge } from '@/components/ui/role-badge'

function UserProfile() {
  const { userRole } = useRolePermissions()
  
  return (
    <div>
      <span>Username</span>
      <RoleBadge role={userRole} />
    </div>
  )
}
```

## Admin Features

### User Role Management
- View all users with their roles
- Search and filter users
- Update user roles (admin only)
- Role-based access control

### Admin Panel Access
- Only accessible to users with 'admin' role
- Automatic redirect for non-admin users
- Admin navigation in sidebar

## Security Features

### Row Level Security (RLS)
- Users can only view their own profile
- Admins can view all profiles
- Only admins can update user roles

### Permission Functions
- Database-level permission checking
- Role hierarchy enforcement
- Feature access validation

## Styling & UI

### Role Colors
- Free: Gray
- Pro: Blue
- Business: Purple
- Enterprise: Emerald
- Admin: Red

### Icons
- Free: No icon
- Pro: Star
- Business: Building
- Enterprise: Shield
- Admin: Crown

## Next Steps

1. **Run the SQL script** in your Supabase database
2. **Test the role system** with different user accounts
3. **Implement role-based features** throughout the application
4. **Add role-based billing** integration
5. **Create role upgrade flows** in the billing system

## Files Created/Modified

### New Files
- `scripts/add-role-column.sql`
- `lib/utils/roles.ts`
- `components/ui/role-badge.tsx`
- `components/ui/role-restriction.tsx`
- `components/admin/UserRoleManagement.tsx`
- `app/admin/page.tsx`
- `hooks/use-role-permissions.ts`
- `ROLE_SYSTEM_IMPLEMENTATION.md`

### Modified Files
- `types/supabase.ts`
- `stores/authStore.ts`
- `components/layout/TopBar.tsx`
- `components/layout/PublicLayout.tsx`
- `components/layout/Sidebar.tsx`
- `components/landing/LandingPage.tsx`

## Testing

To test the role system:

1. Run the SQL script in Supabase
2. Check that existing users have correct roles
3. Verify role badges appear in headers
4. Test admin panel access
5. Verify role restrictions work
6. Test user role management (as admin)

The role system is now fully implemented and ready for use throughout the application! 