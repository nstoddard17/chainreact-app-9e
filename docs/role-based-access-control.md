# Role-Based Access Control (RBAC) System

## Overview

The ChainReact app implements a comprehensive role-based access control system that controls what users can do based on their subscription level and organization role.

## System Roles

### Subscription-Based Roles
- **`free`** - Basic features for individual users
- **`pro`** - Advanced features for power users  
- **`beta-pro`** - Beta testing Pro features
- **`business`** - Team collaboration and advanced features
- **`enterprise`** - Full enterprise features and support
- **`admin`** - Full system access and privileges

### Organization Roles
- **`admin`** - Full control over the organization
- **`editor`** - Can create and edit workflows
- **`viewer`** - Can view and run workflows

## Permission System

### Organization Permissions

#### Organization Management
- `organization.delete` - Delete the entire organization (Admin only)
- `organization.settings` - Manage organization settings (Admin only)
- `organization.analytics` - View detailed analytics (Admin, Editor)

#### Member Management
- `members.invite` - Invite new members (Admin, Editor)
- `members.remove` - Remove members (Admin only)
- `members.roles` - Manage member roles (Admin only)
- `members.view` - View member list (All roles)

#### Workflow Management
- `workflows.create` - Create new workflows (Admin, Editor)
- `workflows.edit` - Edit existing workflows (Admin, Editor)
- `workflows.delete` - Delete workflows (Admin only)
- `workflows.share` - Share workflows publicly (Admin only)
- `workflows.view` - View and run workflows (All roles)

#### Integration Management
- `integrations.create` - Create integrations (Admin, Editor)
- `integrations.edit` - Edit integration settings (Admin, Editor)
- `integrations.delete` - Remove integrations (Admin only)
- `integrations.view` - View integration configurations (All roles)

#### Data & Analytics
- `data.export` - Export data (Admin only)
- `data.view` - View workflow execution data (All roles)

#### Audit & Logs
- `audit.view` - View audit logs (Admin only)

#### Templates
- `templates.create` - Create templates (Admin, Editor)
- `templates.share` - Share templates (Admin only)
- `templates.view` - View and use templates (All roles)

## Usage Examples

### Basic Role Guard

```tsx
import { RoleGuard } from "@/components/ui/role-guard"

// Show content only to business+ users
<RoleGuard requiredRole="business">
  <CreateOrganizationButton />
</RoleGuard>

// Show content only to organization admins
<RoleGuard requiredOrganizationRole="admin">
  <DeleteOrganizationButton />
</RoleGuard>
```

### Permission-Based Guard

```tsx
import { PermissionGuard } from "@/components/ui/role-guard"

// Show workflow creation only to users with permission
<PermissionGuard permission="workflows.create">
  <CreateWorkflowButton />
</PermissionGuard>

// Show fallback for users without permission
<PermissionGuard 
  permission="workflows.edit" 
  showFallback={true}
  fallback={<div>You need editor permissions to edit workflows</div>}
>
  <EditWorkflowButton />
</PermissionGuard>
```

### Organization Role Guard

```tsx
import { OrganizationRoleGuard } from "@/components/ui/role-guard"

// Show admin-only features
<OrganizationRoleGuard requiredRole="admin">
  <OrganizationSettings />
</OrganizationRoleGuard>
```

### Conditional Rendering

```tsx
import { useAuthStore } from "@/stores/authStore"
import { useOrganizationStore } from "@/stores/organizationStore"
import { hasOrganizationPermission } from "@/lib/utils/organizationRoles"

function MyComponent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  
  // Get user's organization role
  const getUserOrgRole = () => {
    if (!currentOrganization || !profile) return 'viewer'
    const userMember = currentOrganization.members?.find(
      (member: any) => member.user_id === profile.id
    )
    return userMember?.role || 'viewer'
  }
  
  const userOrgRole = getUserOrgRole()
  
  return (
    <div>
      {hasOrganizationPermission(userOrgRole, 'workflows.create') && (
        <CreateWorkflowButton />
      )}
      
      {hasOrganizationPermission(userOrgRole, 'members.invite') && (
        <InviteMemberButton />
      )}
    </div>
  )
}
```

## Extending the System

### Adding New Permissions

1. **Define the permission** in `lib/utils/organizationRoles.ts`:

```typescript
export const ORGANIZATION_PERMISSIONS: Record<string, OrganizationPermission> = {
  // ... existing permissions
  
  'new.feature': {
    name: 'New Feature',
    description: 'Access to the new feature',
    allowedRoles: ['admin', 'editor'] // Who can use this feature
  }
}
```

2. **Use the permission** in your components:

```tsx
<PermissionGuard permission="new.feature">
  <NewFeatureComponent />
</PermissionGuard>
```

### Adding New Organization Roles

1. **Update the type** in `lib/utils/organizationRoles.ts`:

```typescript
export type OrganizationRole = 'admin' | 'editor' | 'viewer' | 'moderator'
```

2. **Add role info**:

```typescript
export function getOrganizationRoleInfo(role: OrganizationRole) {
  const roleInfo = {
    // ... existing roles
    
    moderator: {
      name: 'Moderator',
      description: 'Can moderate content and manage users',
      color: 'text-orange-600 dark:text-orange-400',
      badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      icon: '🛡️'
    }
  }
  
  return roleInfo[role]
}
```

3. **Update permissions** to include the new role:

```typescript
'members.moderate': {
  name: 'Moderate Members',
  description: 'Can moderate member behavior',
  allowedRoles: ['admin', 'moderator']
}
```

### Adding Subscription-Based Features

1. **Update the role hierarchy** in `lib/utils/roles.ts`:

```typescript
export const ROLE_HIERARCHY: UserRole[] = ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin']
```

2. **Add feature limits**:

```typescript
export const ROLES: Record<UserRole, RoleInfo> = {
  free: {
    // ... existing config
    limits: {
      workflows: 3,
      integrations: 5,
      executions: 100,
      new_feature: 0 // New feature not available for free users
    }
  },
  pro: {
    // ... existing config
    limits: {
      workflows: 20,
      integrations: 15,
      executions: 1000,
      new_feature: 10 // Pro users get 10 uses
    }
  }
}
```

3. **Use in components**:

```tsx
import { getRoleLimit, isUnlimited } from "@/lib/utils/roles"

function NewFeatureComponent() {
  const { profile } = useAuthStore()
  const userRole = profile?.role || 'free'
  const limit = getRoleLimit(userRole, 'new_feature')
  const unlimited = isUnlimited(userRole, 'new_feature')
  
  return (
    <div>
      {unlimited ? (
        <p>Unlimited access</p>
      ) : (
        <p>{limit} uses remaining</p>
      )}
    </div>
  )
}
```

## Best Practices

### 1. Always Check Permissions
```tsx
// ✅ Good - Check permission before showing action
<PermissionGuard permission="workflows.delete">
  <DeleteButton />
</PermissionGuard>

// ❌ Bad - Show action without checking
<DeleteButton />
```

### 2. Provide Fallbacks
```tsx
// ✅ Good - Show helpful message
<PermissionGuard 
  permission="workflows.create"
  showFallback={true}
  fallback={<UpgradePrompt />}
>
  <CreateWorkflowButton />
</PermissionGuard>
```

### 3. Use Appropriate Granularity
```tsx
// ✅ Good - Specific permission
<PermissionGuard permission="workflows.edit">
  <EditButton />
</PermissionGuard>

// ❌ Bad - Too broad
<RoleGuard requiredOrganizationRole="admin">
  <EditButton />
</RoleGuard>
```

### 4. Handle Edge Cases
```tsx
function MyComponent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  
  // Handle case where user is not in an organization
  if (!currentOrganization) {
    return <JoinOrganizationPrompt />
  }
  
  // Handle case where user has no role
  const userRole = getUserOrgRole()
  if (userRole === 'viewer') {
    return <ViewOnlyMode />
  }
  
  return <FullComponent />
}
```

## Security Considerations

1. **Server-Side Validation**: Always validate permissions on the server side
2. **Database Policies**: Use Row Level Security (RLS) in Supabase
3. **API Protection**: Check permissions in API routes
4. **Audit Logging**: Log all permission-based actions

## Testing

```tsx
// Test different roles
describe('Role-based access', () => {
  it('should show admin features to admin users', () => {
    render(
      <RoleGuard requiredOrganizationRole="admin">
        <AdminFeature />
      </RoleGuard>
    )
    // Test expectations
  })
  
  it('should hide admin features from viewers', () => {
    render(
      <RoleGuard requiredOrganizationRole="admin">
        <AdminFeature />
      </RoleGuard>
    )
    // Test that AdminFeature is not rendered
  })
})
```

This RBAC system provides a solid foundation for controlling access to features and data throughout the application. You can extend it as needed for your specific use cases. 

## Overview

The ChainReact app implements a comprehensive role-based access control system that controls what users can do based on their subscription level and organization role.

## System Roles

### Subscription-Based Roles
- **`free`** - Basic features for individual users
- **`pro`** - Advanced features for power users  
- **`beta-pro`** - Beta testing Pro features
- **`business`** - Team collaboration and advanced features
- **`enterprise`** - Full enterprise features and support
- **`admin`** - Full system access and privileges

### Organization Roles
- **`admin`** - Full control over the organization
- **`editor`** - Can create and edit workflows
- **`viewer`** - Can view and run workflows

## Permission System

### Organization Permissions

#### Organization Management
- `organization.delete` - Delete the entire organization (Admin only)
- `organization.settings` - Manage organization settings (Admin only)
- `organization.analytics` - View detailed analytics (Admin, Editor)

#### Member Management
- `members.invite` - Invite new members (Admin, Editor)
- `members.remove` - Remove members (Admin only)
- `members.roles` - Manage member roles (Admin only)
- `members.view` - View member list (All roles)

#### Workflow Management
- `workflows.create` - Create new workflows (Admin, Editor)
- `workflows.edit` - Edit existing workflows (Admin, Editor)
- `workflows.delete` - Delete workflows (Admin only)
- `workflows.share` - Share workflows publicly (Admin only)
- `workflows.view` - View and run workflows (All roles)

#### Integration Management
- `integrations.create` - Create integrations (Admin, Editor)
- `integrations.edit` - Edit integration settings (Admin, Editor)
- `integrations.delete` - Remove integrations (Admin only)
- `integrations.view` - View integration configurations (All roles)

#### Data & Analytics
- `data.export` - Export data (Admin only)
- `data.view` - View workflow execution data (All roles)

#### Audit & Logs
- `audit.view` - View audit logs (Admin only)

#### Templates
- `templates.create` - Create templates (Admin, Editor)
- `templates.share` - Share templates (Admin only)
- `templates.view` - View and use templates (All roles)

## Usage Examples

### Basic Role Guard

```tsx
import { RoleGuard } from "@/components/ui/role-guard"

// Show content only to business+ users
<RoleGuard requiredRole="business">
  <CreateOrganizationButton />
</RoleGuard>

// Show content only to organization admins
<RoleGuard requiredOrganizationRole="admin">
  <DeleteOrganizationButton />
</RoleGuard>
```

### Permission-Based Guard

```tsx
import { PermissionGuard } from "@/components/ui/role-guard"

// Show workflow creation only to users with permission
<PermissionGuard permission="workflows.create">
  <CreateWorkflowButton />
</PermissionGuard>

// Show fallback for users without permission
<PermissionGuard 
  permission="workflows.edit" 
  showFallback={true}
  fallback={<div>You need editor permissions to edit workflows</div>}
>
  <EditWorkflowButton />
</PermissionGuard>
```

### Organization Role Guard

```tsx
import { OrganizationRoleGuard } from "@/components/ui/role-guard"

// Show admin-only features
<OrganizationRoleGuard requiredRole="admin">
  <OrganizationSettings />
</OrganizationRoleGuard>
```

### Conditional Rendering

```tsx
import { useAuthStore } from "@/stores/authStore"
import { useOrganizationStore } from "@/stores/organizationStore"
import { hasOrganizationPermission } from "@/lib/utils/organizationRoles"

function MyComponent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  
  // Get user's organization role
  const getUserOrgRole = () => {
    if (!currentOrganization || !profile) return 'viewer'
    const userMember = currentOrganization.members?.find(
      (member: any) => member.user_id === profile.id
    )
    return userMember?.role || 'viewer'
  }
  
  const userOrgRole = getUserOrgRole()
  
  return (
    <div>
      {hasOrganizationPermission(userOrgRole, 'workflows.create') && (
        <CreateWorkflowButton />
      )}
      
      {hasOrganizationPermission(userOrgRole, 'members.invite') && (
        <InviteMemberButton />
      )}
    </div>
  )
}
```

## Extending the System

### Adding New Permissions

1. **Define the permission** in `lib/utils/organizationRoles.ts`:

```typescript
export const ORGANIZATION_PERMISSIONS: Record<string, OrganizationPermission> = {
  // ... existing permissions
  
  'new.feature': {
    name: 'New Feature',
    description: 'Access to the new feature',
    allowedRoles: ['admin', 'editor'] // Who can use this feature
  }
}
```

2. **Use the permission** in your components:

```tsx
<PermissionGuard permission="new.feature">
  <NewFeatureComponent />
</PermissionGuard>
```

### Adding New Organization Roles

1. **Update the type** in `lib/utils/organizationRoles.ts`:

```typescript
export type OrganizationRole = 'admin' | 'editor' | 'viewer' | 'moderator'
```

2. **Add role info**:

```typescript
export function getOrganizationRoleInfo(role: OrganizationRole) {
  const roleInfo = {
    // ... existing roles
    
    moderator: {
      name: 'Moderator',
      description: 'Can moderate content and manage users',
      color: 'text-orange-600 dark:text-orange-400',
      badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      icon: '🛡️'
    }
  }
  
  return roleInfo[role]
}
```

3. **Update permissions** to include the new role:

```typescript
'members.moderate': {
  name: 'Moderate Members',
  description: 'Can moderate member behavior',
  allowedRoles: ['admin', 'moderator']
}
```

### Adding Subscription-Based Features

1. **Update the role hierarchy** in `lib/utils/roles.ts`:

```typescript
export const ROLE_HIERARCHY: UserRole[] = ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin']
```

2. **Add feature limits**:

```typescript
export const ROLES: Record<UserRole, RoleInfo> = {
  free: {
    // ... existing config
    limits: {
      workflows: 3,
      integrations: 5,
      executions: 100,
      new_feature: 0 // New feature not available for free users
    }
  },
  pro: {
    // ... existing config
    limits: {
      workflows: 20,
      integrations: 15,
      executions: 1000,
      new_feature: 10 // Pro users get 10 uses
    }
  }
}
```

3. **Use in components**:

```tsx
import { getRoleLimit, isUnlimited } from "@/lib/utils/roles"

function NewFeatureComponent() {
  const { profile } = useAuthStore()
  const userRole = profile?.role || 'free'
  const limit = getRoleLimit(userRole, 'new_feature')
  const unlimited = isUnlimited(userRole, 'new_feature')
  
  return (
    <div>
      {unlimited ? (
        <p>Unlimited access</p>
      ) : (
        <p>{limit} uses remaining</p>
      )}
    </div>
  )
}
```

## Best Practices

### 1. Always Check Permissions
```tsx
// ✅ Good - Check permission before showing action
<PermissionGuard permission="workflows.delete">
  <DeleteButton />
</PermissionGuard>

// ❌ Bad - Show action without checking
<DeleteButton />
```

### 2. Provide Fallbacks
```tsx
// ✅ Good - Show helpful message
<PermissionGuard 
  permission="workflows.create"
  showFallback={true}
  fallback={<UpgradePrompt />}
>
  <CreateWorkflowButton />
</PermissionGuard>
```

### 3. Use Appropriate Granularity
```tsx
// ✅ Good - Specific permission
<PermissionGuard permission="workflows.edit">
  <EditButton />
</PermissionGuard>

// ❌ Bad - Too broad
<RoleGuard requiredOrganizationRole="admin">
  <EditButton />
</RoleGuard>
```

### 4. Handle Edge Cases
```tsx
function MyComponent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  
  // Handle case where user is not in an organization
  if (!currentOrganization) {
    return <JoinOrganizationPrompt />
  }
  
  // Handle case where user has no role
  const userRole = getUserOrgRole()
  if (userRole === 'viewer') {
    return <ViewOnlyMode />
  }
  
  return <FullComponent />
}
```

## Security Considerations

1. **Server-Side Validation**: Always validate permissions on the server side
2. **Database Policies**: Use Row Level Security (RLS) in Supabase
3. **API Protection**: Check permissions in API routes
4. **Audit Logging**: Log all permission-based actions

## Testing

```tsx
// Test different roles
describe('Role-based access', () => {
  it('should show admin features to admin users', () => {
    render(
      <RoleGuard requiredOrganizationRole="admin">
        <AdminFeature />
      </RoleGuard>
    )
    // Test expectations
  })
  
  it('should hide admin features from viewers', () => {
    render(
      <RoleGuard requiredOrganizationRole="admin">
        <AdminFeature />
      </RoleGuard>
    )
    // Test that AdminFeature is not rendered
  })
})
```

This RBAC system provides a solid foundation for controlling access to features and data throughout the application. You can extend it as needed for your specific use cases. 

## Overview

The ChainReact app implements a comprehensive role-based access control system that controls what users can do based on their subscription level and organization role.

## System Roles

### Subscription-Based Roles
- **`free`** - Basic features for individual users
- **`pro`** - Advanced features for power users  
- **`beta-pro`** - Beta testing Pro features
- **`business`** - Team collaboration and advanced features
- **`enterprise`** - Full enterprise features and support
- **`admin`** - Full system access and privileges

### Organization Roles
- **`admin`** - Full control over the organization
- **`editor`** - Can create and edit workflows
- **`viewer`** - Can view and run workflows

## Permission System

### Organization Permissions

#### Organization Management
- `organization.delete` - Delete the entire organization (Admin only)
- `organization.settings` - Manage organization settings (Admin only)
- `organization.analytics` - View detailed analytics (Admin, Editor)

#### Member Management
- `members.invite` - Invite new members (Admin, Editor)
- `members.remove` - Remove members (Admin only)
- `members.roles` - Manage member roles (Admin only)
- `members.view` - View member list (All roles)

#### Workflow Management
- `workflows.create` - Create new workflows (Admin, Editor)
- `workflows.edit` - Edit existing workflows (Admin, Editor)
- `workflows.delete` - Delete workflows (Admin only)
- `workflows.share` - Share workflows publicly (Admin only)
- `workflows.view` - View and run workflows (All roles)

#### Integration Management
- `integrations.create` - Create integrations (Admin, Editor)
- `integrations.edit` - Edit integration settings (Admin, Editor)
- `integrations.delete` - Remove integrations (Admin only)
- `integrations.view` - View integration configurations (All roles)

#### Data & Analytics
- `data.export` - Export data (Admin only)
- `data.view` - View workflow execution data (All roles)

#### Audit & Logs
- `audit.view` - View audit logs (Admin only)

#### Templates
- `templates.create` - Create templates (Admin, Editor)
- `templates.share` - Share templates (Admin only)
- `templates.view` - View and use templates (All roles)

## Usage Examples

### Basic Role Guard

```tsx
import { RoleGuard } from "@/components/ui/role-guard"

// Show content only to business+ users
<RoleGuard requiredRole="business">
  <CreateOrganizationButton />
</RoleGuard>

// Show content only to organization admins
<RoleGuard requiredOrganizationRole="admin">
  <DeleteOrganizationButton />
</RoleGuard>
```

### Permission-Based Guard

```tsx
import { PermissionGuard } from "@/components/ui/role-guard"

// Show workflow creation only to users with permission
<PermissionGuard permission="workflows.create">
  <CreateWorkflowButton />
</PermissionGuard>

// Show fallback for users without permission
<PermissionGuard 
  permission="workflows.edit" 
  showFallback={true}
  fallback={<div>You need editor permissions to edit workflows</div>}
>
  <EditWorkflowButton />
</PermissionGuard>
```

### Organization Role Guard

```tsx
import { OrganizationRoleGuard } from "@/components/ui/role-guard"

// Show admin-only features
<OrganizationRoleGuard requiredRole="admin">
  <OrganizationSettings />
</OrganizationRoleGuard>
```

### Conditional Rendering

```tsx
import { useAuthStore } from "@/stores/authStore"
import { useOrganizationStore } from "@/stores/organizationStore"
import { hasOrganizationPermission } from "@/lib/utils/organizationRoles"

function MyComponent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  
  // Get user's organization role
  const getUserOrgRole = () => {
    if (!currentOrganization || !profile) return 'viewer'
    const userMember = currentOrganization.members?.find(
      (member: any) => member.user_id === profile.id
    )
    return userMember?.role || 'viewer'
  }
  
  const userOrgRole = getUserOrgRole()
  
  return (
    <div>
      {hasOrganizationPermission(userOrgRole, 'workflows.create') && (
        <CreateWorkflowButton />
      )}
      
      {hasOrganizationPermission(userOrgRole, 'members.invite') && (
        <InviteMemberButton />
      )}
    </div>
  )
}
```

## Extending the System

### Adding New Permissions

1. **Define the permission** in `lib/utils/organizationRoles.ts`:

```typescript
export const ORGANIZATION_PERMISSIONS: Record<string, OrganizationPermission> = {
  // ... existing permissions
  
  'new.feature': {
    name: 'New Feature',
    description: 'Access to the new feature',
    allowedRoles: ['admin', 'editor'] // Who can use this feature
  }
}
```

2. **Use the permission** in your components:

```tsx
<PermissionGuard permission="new.feature">
  <NewFeatureComponent />
</PermissionGuard>
```

### Adding New Organization Roles

1. **Update the type** in `lib/utils/organizationRoles.ts`:

```typescript
export type OrganizationRole = 'admin' | 'editor' | 'viewer' | 'moderator'
```

2. **Add role info**:

```typescript
export function getOrganizationRoleInfo(role: OrganizationRole) {
  const roleInfo = {
    // ... existing roles
    
    moderator: {
      name: 'Moderator',
      description: 'Can moderate content and manage users',
      color: 'text-orange-600 dark:text-orange-400',
      badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      icon: '🛡️'
    }
  }
  
  return roleInfo[role]
}
```

3. **Update permissions** to include the new role:

```typescript
'members.moderate': {
  name: 'Moderate Members',
  description: 'Can moderate member behavior',
  allowedRoles: ['admin', 'moderator']
}
```

### Adding Subscription-Based Features

1. **Update the role hierarchy** in `lib/utils/roles.ts`:

```typescript
export const ROLE_HIERARCHY: UserRole[] = ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin']
```

2. **Add feature limits**:

```typescript
export const ROLES: Record<UserRole, RoleInfo> = {
  free: {
    // ... existing config
    limits: {
      workflows: 3,
      integrations: 5,
      executions: 100,
      new_feature: 0 // New feature not available for free users
    }
  },
  pro: {
    // ... existing config
    limits: {
      workflows: 20,
      integrations: 15,
      executions: 1000,
      new_feature: 10 // Pro users get 10 uses
    }
  }
}
```

3. **Use in components**:

```tsx
import { getRoleLimit, isUnlimited } from "@/lib/utils/roles"

function NewFeatureComponent() {
  const { profile } = useAuthStore()
  const userRole = profile?.role || 'free'
  const limit = getRoleLimit(userRole, 'new_feature')
  const unlimited = isUnlimited(userRole, 'new_feature')
  
  return (
    <div>
      {unlimited ? (
        <p>Unlimited access</p>
      ) : (
        <p>{limit} uses remaining</p>
      )}
    </div>
  )
}
```

## Best Practices

### 1. Always Check Permissions
```tsx
// ✅ Good - Check permission before showing action
<PermissionGuard permission="workflows.delete">
  <DeleteButton />
</PermissionGuard>

// ❌ Bad - Show action without checking
<DeleteButton />
```

### 2. Provide Fallbacks
```tsx
// ✅ Good - Show helpful message
<PermissionGuard 
  permission="workflows.create"
  showFallback={true}
  fallback={<UpgradePrompt />}
>
  <CreateWorkflowButton />
</PermissionGuard>
```

### 3. Use Appropriate Granularity
```tsx
// ✅ Good - Specific permission
<PermissionGuard permission="workflows.edit">
  <EditButton />
</PermissionGuard>

// ❌ Bad - Too broad
<RoleGuard requiredOrganizationRole="admin">
  <EditButton />
</RoleGuard>
```

### 4. Handle Edge Cases
```tsx
function MyComponent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  
  // Handle case where user is not in an organization
  if (!currentOrganization) {
    return <JoinOrganizationPrompt />
  }
  
  // Handle case where user has no role
  const userRole = getUserOrgRole()
  if (userRole === 'viewer') {
    return <ViewOnlyMode />
  }
  
  return <FullComponent />
}
```

## Security Considerations

1. **Server-Side Validation**: Always validate permissions on the server side
2. **Database Policies**: Use Row Level Security (RLS) in Supabase
3. **API Protection**: Check permissions in API routes
4. **Audit Logging**: Log all permission-based actions

## Testing

```tsx
// Test different roles
describe('Role-based access', () => {
  it('should show admin features to admin users', () => {
    render(
      <RoleGuard requiredOrganizationRole="admin">
        <AdminFeature />
      </RoleGuard>
    )
    // Test expectations
  })
  
  it('should hide admin features from viewers', () => {
    render(
      <RoleGuard requiredOrganizationRole="admin">
        <AdminFeature />
      </RoleGuard>
    )
    // Test that AdminFeature is not rendered
  })
})
```

This RBAC system provides a solid foundation for controlling access to features and data throughout the application. You can extend it as needed for your specific use cases. 

## Overview

The ChainReact app implements a comprehensive role-based access control system that controls what users can do based on their subscription level and organization role.

## System Roles

### Subscription-Based Roles
- **`free`** - Basic features for individual users
- **`pro`** - Advanced features for power users  
- **`beta-pro`** - Beta testing Pro features
- **`business`** - Team collaboration and advanced features
- **`enterprise`** - Full enterprise features and support
- **`admin`** - Full system access and privileges

### Organization Roles
- **`admin`** - Full control over the organization
- **`editor`** - Can create and edit workflows
- **`viewer`** - Can view and run workflows

## Permission System

### Organization Permissions

#### Organization Management
- `organization.delete` - Delete the entire organization (Admin only)
- `organization.settings` - Manage organization settings (Admin only)
- `organization.analytics` - View detailed analytics (Admin, Editor)

#### Member Management
- `members.invite` - Invite new members (Admin, Editor)
- `members.remove` - Remove members (Admin only)
- `members.roles` - Manage member roles (Admin only)
- `members.view` - View member list (All roles)

#### Workflow Management
- `workflows.create` - Create new workflows (Admin, Editor)
- `workflows.edit` - Edit existing workflows (Admin, Editor)
- `workflows.delete` - Delete workflows (Admin only)
- `workflows.share` - Share workflows publicly (Admin only)
- `workflows.view` - View and run workflows (All roles)

#### Integration Management
- `integrations.create` - Create integrations (Admin, Editor)
- `integrations.edit` - Edit integration settings (Admin, Editor)
- `integrations.delete` - Remove integrations (Admin only)
- `integrations.view` - View integration configurations (All roles)

#### Data & Analytics
- `data.export` - Export data (Admin only)
- `data.view` - View workflow execution data (All roles)

#### Audit & Logs
- `audit.view` - View audit logs (Admin only)

#### Templates
- `templates.create` - Create templates (Admin, Editor)
- `templates.share` - Share templates (Admin only)
- `templates.view` - View and use templates (All roles)

## Usage Examples

### Basic Role Guard

```tsx
import { RoleGuard } from "@/components/ui/role-guard"

// Show content only to business+ users
<RoleGuard requiredRole="business">
  <CreateOrganizationButton />
</RoleGuard>

// Show content only to organization admins
<RoleGuard requiredOrganizationRole="admin">
  <DeleteOrganizationButton />
</RoleGuard>
```

### Permission-Based Guard

```tsx
import { PermissionGuard } from "@/components/ui/role-guard"

// Show workflow creation only to users with permission
<PermissionGuard permission="workflows.create">
  <CreateWorkflowButton />
</PermissionGuard>

// Show fallback for users without permission
<PermissionGuard 
  permission="workflows.edit" 
  showFallback={true}
  fallback={<div>You need editor permissions to edit workflows</div>}
>
  <EditWorkflowButton />
</PermissionGuard>
```

### Organization Role Guard

```tsx
import { OrganizationRoleGuard } from "@/components/ui/role-guard"

// Show admin-only features
<OrganizationRoleGuard requiredRole="admin">
  <OrganizationSettings />
</OrganizationRoleGuard>
```

### Conditional Rendering

```tsx
import { useAuthStore } from "@/stores/authStore"
import { useOrganizationStore } from "@/stores/organizationStore"
import { hasOrganizationPermission } from "@/lib/utils/organizationRoles"

function MyComponent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  
  // Get user's organization role
  const getUserOrgRole = () => {
    if (!currentOrganization || !profile) return 'viewer'
    const userMember = currentOrganization.members?.find(
      (member: any) => member.user_id === profile.id
    )
    return userMember?.role || 'viewer'
  }
  
  const userOrgRole = getUserOrgRole()
  
  return (
    <div>
      {hasOrganizationPermission(userOrgRole, 'workflows.create') && (
        <CreateWorkflowButton />
      )}
      
      {hasOrganizationPermission(userOrgRole, 'members.invite') && (
        <InviteMemberButton />
      )}
    </div>
  )
}
```

## Extending the System

### Adding New Permissions

1. **Define the permission** in `lib/utils/organizationRoles.ts`:

```typescript
export const ORGANIZATION_PERMISSIONS: Record<string, OrganizationPermission> = {
  // ... existing permissions
  
  'new.feature': {
    name: 'New Feature',
    description: 'Access to the new feature',
    allowedRoles: ['admin', 'editor'] // Who can use this feature
  }
}
```

2. **Use the permission** in your components:

```tsx
<PermissionGuard permission="new.feature">
  <NewFeatureComponent />
</PermissionGuard>
```

### Adding New Organization Roles

1. **Update the type** in `lib/utils/organizationRoles.ts`:

```typescript
export type OrganizationRole = 'admin' | 'editor' | 'viewer' | 'moderator'
```

2. **Add role info**:

```typescript
export function getOrganizationRoleInfo(role: OrganizationRole) {
  const roleInfo = {
    // ... existing roles
    
    moderator: {
      name: 'Moderator',
      description: 'Can moderate content and manage users',
      color: 'text-orange-600 dark:text-orange-400',
      badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      icon: '🛡️'
    }
  }
  
  return roleInfo[role]
}
```

3. **Update permissions** to include the new role:

```typescript
'members.moderate': {
  name: 'Moderate Members',
  description: 'Can moderate member behavior',
  allowedRoles: ['admin', 'moderator']
}
```

### Adding Subscription-Based Features

1. **Update the role hierarchy** in `lib/utils/roles.ts`:

```typescript
export const ROLE_HIERARCHY: UserRole[] = ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin']
```

2. **Add feature limits**:

```typescript
export const ROLES: Record<UserRole, RoleInfo> = {
  free: {
    // ... existing config
    limits: {
      workflows: 3,
      integrations: 5,
      executions: 100,
      new_feature: 0 // New feature not available for free users
    }
  },
  pro: {
    // ... existing config
    limits: {
      workflows: 20,
      integrations: 15,
      executions: 1000,
      new_feature: 10 // Pro users get 10 uses
    }
  }
}
```

3. **Use in components**:

```tsx
import { getRoleLimit, isUnlimited } from "@/lib/utils/roles"

function NewFeatureComponent() {
  const { profile } = useAuthStore()
  const userRole = profile?.role || 'free'
  const limit = getRoleLimit(userRole, 'new_feature')
  const unlimited = isUnlimited(userRole, 'new_feature')
  
  return (
    <div>
      {unlimited ? (
        <p>Unlimited access</p>
      ) : (
        <p>{limit} uses remaining</p>
      )}
    </div>
  )
}
```

## Best Practices

### 1. Always Check Permissions
```tsx
// ✅ Good - Check permission before showing action
<PermissionGuard permission="workflows.delete">
  <DeleteButton />
</PermissionGuard>

// ❌ Bad - Show action without checking
<DeleteButton />
```

### 2. Provide Fallbacks
```tsx
// ✅ Good - Show helpful message
<PermissionGuard 
  permission="workflows.create"
  showFallback={true}
  fallback={<UpgradePrompt />}
>
  <CreateWorkflowButton />
</PermissionGuard>
```

### 3. Use Appropriate Granularity
```tsx
// ✅ Good - Specific permission
<PermissionGuard permission="workflows.edit">
  <EditButton />
</PermissionGuard>

// ❌ Bad - Too broad
<RoleGuard requiredOrganizationRole="admin">
  <EditButton />
</RoleGuard>
```

### 4. Handle Edge Cases
```tsx
function MyComponent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  
  // Handle case where user is not in an organization
  if (!currentOrganization) {
    return <JoinOrganizationPrompt />
  }
  
  // Handle case where user has no role
  const userRole = getUserOrgRole()
  if (userRole === 'viewer') {
    return <ViewOnlyMode />
  }
  
  return <FullComponent />
}
```

## Security Considerations

1. **Server-Side Validation**: Always validate permissions on the server side
2. **Database Policies**: Use Row Level Security (RLS) in Supabase
3. **API Protection**: Check permissions in API routes
4. **Audit Logging**: Log all permission-based actions

## Testing

```tsx
// Test different roles
describe('Role-based access', () => {
  it('should show admin features to admin users', () => {
    render(
      <RoleGuard requiredOrganizationRole="admin">
        <AdminFeature />
      </RoleGuard>
    )
    // Test expectations
  })
  
  it('should hide admin features from viewers', () => {
    render(
      <RoleGuard requiredOrganizationRole="admin">
        <AdminFeature />
      </RoleGuard>
    )
    // Test that AdminFeature is not rendered
  })
})
```

This RBAC system provides a solid foundation for controlling access to features and data throughout the application. You can extend it as needed for your specific use cases. 

## Overview

The ChainReact app implements a comprehensive role-based access control system that controls what users can do based on their subscription level and organization role.

## System Roles

### Subscription-Based Roles
- **`free`** - Basic features for individual users
- **`pro`** - Advanced features for power users  
- **`beta-pro`** - Beta testing Pro features
- **`business`** - Team collaboration and advanced features
- **`enterprise`** - Full enterprise features and support
- **`admin`** - Full system access and privileges

### Organization Roles
- **`admin`** - Full control over the organization
- **`editor`** - Can create and edit workflows
- **`viewer`** - Can view and run workflows

## Permission System

### Organization Permissions

#### Organization Management
- `organization.delete` - Delete the entire organization (Admin only)
- `organization.settings` - Manage organization settings (Admin only)
- `organization.analytics` - View detailed analytics (Admin, Editor)

#### Member Management
- `members.invite` - Invite new members (Admin, Editor)
- `members.remove` - Remove members (Admin only)
- `members.roles` - Manage member roles (Admin only)
- `members.view` - View member list (All roles)

#### Workflow Management
- `workflows.create` - Create new workflows (Admin, Editor)
- `workflows.edit` - Edit existing workflows (Admin, Editor)
- `workflows.delete` - Delete workflows (Admin only)
- `workflows.share` - Share workflows publicly (Admin only)
- `workflows.view` - View and run workflows (All roles)

#### Integration Management
- `integrations.create` - Create integrations (Admin, Editor)
- `integrations.edit` - Edit integration settings (Admin, Editor)
- `integrations.delete` - Remove integrations (Admin only)
- `integrations.view` - View integration configurations (All roles)

#### Data & Analytics
- `data.export` - Export data (Admin only)
- `data.view` - View workflow execution data (All roles)

#### Audit & Logs
- `audit.view` - View audit logs (Admin only)

#### Templates
- `templates.create` - Create templates (Admin, Editor)
- `templates.share` - Share templates (Admin only)
- `templates.view` - View and use templates (All roles)

## Usage Examples

### Basic Role Guard

```tsx
import { RoleGuard } from "@/components/ui/role-guard"

// Show content only to business+ users
<RoleGuard requiredRole="business">
  <CreateOrganizationButton />
</RoleGuard>

// Show content only to organization admins
<RoleGuard requiredOrganizationRole="admin">
  <DeleteOrganizationButton />
</RoleGuard>
```

### Permission-Based Guard

```tsx
import { PermissionGuard } from "@/components/ui/role-guard"

// Show workflow creation only to users with permission
<PermissionGuard permission="workflows.create">
  <CreateWorkflowButton />
</PermissionGuard>

// Show fallback for users without permission
<PermissionGuard 
  permission="workflows.edit" 
  showFallback={true}
  fallback={<div>You need editor permissions to edit workflows</div>}
>
  <EditWorkflowButton />
</PermissionGuard>
```

### Organization Role Guard

```tsx
import { OrganizationRoleGuard } from "@/components/ui/role-guard"

// Show admin-only features
<OrganizationRoleGuard requiredRole="admin">
  <OrganizationSettings />
</OrganizationRoleGuard>
```

### Conditional Rendering

```tsx
import { useAuthStore } from "@/stores/authStore"
import { useOrganizationStore } from "@/stores/organizationStore"
import { hasOrganizationPermission } from "@/lib/utils/organizationRoles"

function MyComponent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  
  // Get user's organization role
  const getUserOrgRole = () => {
    if (!currentOrganization || !profile) return 'viewer'
    const userMember = currentOrganization.members?.find(
      (member: any) => member.user_id === profile.id
    )
    return userMember?.role || 'viewer'
  }
  
  const userOrgRole = getUserOrgRole()
  
  return (
    <div>
      {hasOrganizationPermission(userOrgRole, 'workflows.create') && (
        <CreateWorkflowButton />
      )}
      
      {hasOrganizationPermission(userOrgRole, 'members.invite') && (
        <InviteMemberButton />
      )}
    </div>
  )
}
```

## Extending the System

### Adding New Permissions

1. **Define the permission** in `lib/utils/organizationRoles.ts`:

```typescript
export const ORGANIZATION_PERMISSIONS: Record<string, OrganizationPermission> = {
  // ... existing permissions
  
  'new.feature': {
    name: 'New Feature',
    description: 'Access to the new feature',
    allowedRoles: ['admin', 'editor'] // Who can use this feature
  }
}
```

2. **Use the permission** in your components:

```tsx
<PermissionGuard permission="new.feature">
  <NewFeatureComponent />
</PermissionGuard>
```

### Adding New Organization Roles

1. **Update the type** in `lib/utils/organizationRoles.ts`:

```typescript
export type OrganizationRole = 'admin' | 'editor' | 'viewer' | 'moderator'
```

2. **Add role info**:

```typescript
export function getOrganizationRoleInfo(role: OrganizationRole) {
  const roleInfo = {
    // ... existing roles
    
    moderator: {
      name: 'Moderator',
      description: 'Can moderate content and manage users',
      color: 'text-orange-600 dark:text-orange-400',
      badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      icon: '🛡️'
    }
  }
  
  return roleInfo[role]
}
```

3. **Update permissions** to include the new role:

```typescript
'members.moderate': {
  name: 'Moderate Members',
  description: 'Can moderate member behavior',
  allowedRoles: ['admin', 'moderator']
}
```

### Adding Subscription-Based Features

1. **Update the role hierarchy** in `lib/utils/roles.ts`:

```typescript
export const ROLE_HIERARCHY: UserRole[] = ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin']
```

2. **Add feature limits**:

```typescript
export const ROLES: Record<UserRole, RoleInfo> = {
  free: {
    // ... existing config
    limits: {
      workflows: 3,
      integrations: 5,
      executions: 100,
      new_feature: 0 // New feature not available for free users
    }
  },
  pro: {
    // ... existing config
    limits: {
      workflows: 20,
      integrations: 15,
      executions: 1000,
      new_feature: 10 // Pro users get 10 uses
    }
  }
}
```

3. **Use in components**:

```tsx
import { getRoleLimit, isUnlimited } from "@/lib/utils/roles"

function NewFeatureComponent() {
  const { profile } = useAuthStore()
  const userRole = profile?.role || 'free'
  const limit = getRoleLimit(userRole, 'new_feature')
  const unlimited = isUnlimited(userRole, 'new_feature')
  
  return (
    <div>
      {unlimited ? (
        <p>Unlimited access</p>
      ) : (
        <p>{limit} uses remaining</p>
      )}
    </div>
  )
}
```

## Best Practices

### 1. Always Check Permissions
```tsx
// ✅ Good - Check permission before showing action
<PermissionGuard permission="workflows.delete">
  <DeleteButton />
</PermissionGuard>

// ❌ Bad - Show action without checking
<DeleteButton />
```

### 2. Provide Fallbacks
```tsx
// ✅ Good - Show helpful message
<PermissionGuard 
  permission="workflows.create"
  showFallback={true}
  fallback={<UpgradePrompt />}
>
  <CreateWorkflowButton />
</PermissionGuard>
```

### 3. Use Appropriate Granularity
```tsx
// ✅ Good - Specific permission
<PermissionGuard permission="workflows.edit">
  <EditButton />
</PermissionGuard>

// ❌ Bad - Too broad
<RoleGuard requiredOrganizationRole="admin">
  <EditButton />
</RoleGuard>
```

### 4. Handle Edge Cases
```tsx
function MyComponent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  
  // Handle case where user is not in an organization
  if (!currentOrganization) {
    return <JoinOrganizationPrompt />
  }
  
  // Handle case where user has no role
  const userRole = getUserOrgRole()
  if (userRole === 'viewer') {
    return <ViewOnlyMode />
  }
  
  return <FullComponent />
}
```

## Security Considerations

1. **Server-Side Validation**: Always validate permissions on the server side
2. **Database Policies**: Use Row Level Security (RLS) in Supabase
3. **API Protection**: Check permissions in API routes
4. **Audit Logging**: Log all permission-based actions

## Testing

```tsx
// Test different roles
describe('Role-based access', () => {
  it('should show admin features to admin users', () => {
    render(
      <RoleGuard requiredOrganizationRole="admin">
        <AdminFeature />
      </RoleGuard>
    )
    // Test expectations
  })
  
  it('should hide admin features from viewers', () => {
    render(
      <RoleGuard requiredOrganizationRole="admin">
        <AdminFeature />
      </RoleGuard>
    )
    // Test that AdminFeature is not rendered
  })
})
```

This RBAC system provides a solid foundation for controlling access to features and data throughout the application. You can extend it as needed for your specific use cases. 

## Overview

The ChainReact app implements a comprehensive role-based access control system that controls what users can do based on their subscription level and organization role.

## System Roles

### Subscription-Based Roles
- **`free`** - Basic features for individual users
- **`pro`** - Advanced features for power users  
- **`beta-pro`** - Beta testing Pro features
- **`business`** - Team collaboration and advanced features
- **`enterprise`** - Full enterprise features and support
- **`admin`** - Full system access and privileges

### Organization Roles
- **`admin`** - Full control over the organization
- **`editor`** - Can create and edit workflows
- **`viewer`** - Can view and run workflows

## Permission System

### Organization Permissions

#### Organization Management
- `organization.delete` - Delete the entire organization (Admin only)
- `organization.settings` - Manage organization settings (Admin only)
- `organization.analytics` - View detailed analytics (Admin, Editor)

#### Member Management
- `members.invite` - Invite new members (Admin, Editor)
- `members.remove` - Remove members (Admin only)
- `members.roles` - Manage member roles (Admin only)
- `members.view` - View member list (All roles)

#### Workflow Management
- `workflows.create` - Create new workflows (Admin, Editor)
- `workflows.edit` - Edit existing workflows (Admin, Editor)
- `workflows.delete` - Delete workflows (Admin only)
- `workflows.share` - Share workflows publicly (Admin only)
- `workflows.view` - View and run workflows (All roles)

#### Integration Management
- `integrations.create` - Create integrations (Admin, Editor)
- `integrations.edit` - Edit integration settings (Admin, Editor)
- `integrations.delete` - Remove integrations (Admin only)
- `integrations.view` - View integration configurations (All roles)

#### Data & Analytics
- `data.export` - Export data (Admin only)
- `data.view` - View workflow execution data (All roles)

#### Audit & Logs
- `audit.view` - View audit logs (Admin only)

#### Templates
- `templates.create` - Create templates (Admin, Editor)
- `templates.share` - Share templates (Admin only)
- `templates.view` - View and use templates (All roles)

## Usage Examples

### Basic Role Guard

```tsx
import { RoleGuard } from "@/components/ui/role-guard"

// Show content only to business+ users
<RoleGuard requiredRole="business">
  <CreateOrganizationButton />
</RoleGuard>

// Show content only to organization admins
<RoleGuard requiredOrganizationRole="admin">
  <DeleteOrganizationButton />
</RoleGuard>
```

### Permission-Based Guard

```tsx
import { PermissionGuard } from "@/components/ui/role-guard"

// Show workflow creation only to users with permission
<PermissionGuard permission="workflows.create">
  <CreateWorkflowButton />
</PermissionGuard>

// Show fallback for users without permission
<PermissionGuard 
  permission="workflows.edit" 
  showFallback={true}
  fallback={<div>You need editor permissions to edit workflows</div>}
>
  <EditWorkflowButton />
</PermissionGuard>
```

### Organization Role Guard

```tsx
import { OrganizationRoleGuard } from "@/components/ui/role-guard"

// Show admin-only features
<OrganizationRoleGuard requiredRole="admin">
  <OrganizationSettings />
</OrganizationRoleGuard>
```

### Conditional Rendering

```tsx
import { useAuthStore } from "@/stores/authStore"
import { useOrganizationStore } from "@/stores/organizationStore"
import { hasOrganizationPermission } from "@/lib/utils/organizationRoles"

function MyComponent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  
  // Get user's organization role
  const getUserOrgRole = () => {
    if (!currentOrganization || !profile) return 'viewer'
    const userMember = currentOrganization.members?.find(
      (member: any) => member.user_id === profile.id
    )
    return userMember?.role || 'viewer'
  }
  
  const userOrgRole = getUserOrgRole()
  
  return (
    <div>
      {hasOrganizationPermission(userOrgRole, 'workflows.create') && (
        <CreateWorkflowButton />
      )}
      
      {hasOrganizationPermission(userOrgRole, 'members.invite') && (
        <InviteMemberButton />
      )}
    </div>
  )
}
```

## Extending the System

### Adding New Permissions

1. **Define the permission** in `lib/utils/organizationRoles.ts`:

```typescript
export const ORGANIZATION_PERMISSIONS: Record<string, OrganizationPermission> = {
  // ... existing permissions
  
  'new.feature': {
    name: 'New Feature',
    description: 'Access to the new feature',
    allowedRoles: ['admin', 'editor'] // Who can use this feature
  }
}
```

2. **Use the permission** in your components:

```tsx
<PermissionGuard permission="new.feature">
  <NewFeatureComponent />
</PermissionGuard>
```

### Adding New Organization Roles

1. **Update the type** in `lib/utils/organizationRoles.ts`:

```typescript
export type OrganizationRole = 'admin' | 'editor' | 'viewer' | 'moderator'
```

2. **Add role info**:

```typescript
export function getOrganizationRoleInfo(role: OrganizationRole) {
  const roleInfo = {
    // ... existing roles
    
    moderator: {
      name: 'Moderator',
      description: 'Can moderate content and manage users',
      color: 'text-orange-600 dark:text-orange-400',
      badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      icon: '🛡️'
    }
  }
  
  return roleInfo[role]
}
```

3. **Update permissions** to include the new role:

```typescript
'members.moderate': {
  name: 'Moderate Members',
  description: 'Can moderate member behavior',
  allowedRoles: ['admin', 'moderator']
}
```

### Adding Subscription-Based Features

1. **Update the role hierarchy** in `lib/utils/roles.ts`:

```typescript
export const ROLE_HIERARCHY: UserRole[] = ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin']
```

2. **Add feature limits**:

```typescript
export const ROLES: Record<UserRole, RoleInfo> = {
  free: {
    // ... existing config
    limits: {
      workflows: 3,
      integrations: 5,
      executions: 100,
      new_feature: 0 // New feature not available for free users
    }
  },
  pro: {
    // ... existing config
    limits: {
      workflows: 20,
      integrations: 15,
      executions: 1000,
      new_feature: 10 // Pro users get 10 uses
    }
  }
}
```

3. **Use in components**:

```tsx
import { getRoleLimit, isUnlimited } from "@/lib/utils/roles"

function NewFeatureComponent() {
  const { profile } = useAuthStore()
  const userRole = profile?.role || 'free'
  const limit = getRoleLimit(userRole, 'new_feature')
  const unlimited = isUnlimited(userRole, 'new_feature')
  
  return (
    <div>
      {unlimited ? (
        <p>Unlimited access</p>
      ) : (
        <p>{limit} uses remaining</p>
      )}
    </div>
  )
}
```

## Best Practices

### 1. Always Check Permissions
```tsx
// ✅ Good - Check permission before showing action
<PermissionGuard permission="workflows.delete">
  <DeleteButton />
</PermissionGuard>

// ❌ Bad - Show action without checking
<DeleteButton />
```

### 2. Provide Fallbacks
```tsx
// ✅ Good - Show helpful message
<PermissionGuard 
  permission="workflows.create"
  showFallback={true}
  fallback={<UpgradePrompt />}
>
  <CreateWorkflowButton />
</PermissionGuard>
```

### 3. Use Appropriate Granularity
```tsx
// ✅ Good - Specific permission
<PermissionGuard permission="workflows.edit">
  <EditButton />
</PermissionGuard>

// ❌ Bad - Too broad
<RoleGuard requiredOrganizationRole="admin">
  <EditButton />
</RoleGuard>
```

### 4. Handle Edge Cases
```tsx
function MyComponent() {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  
  // Handle case where user is not in an organization
  if (!currentOrganization) {
    return <JoinOrganizationPrompt />
  }
  
  // Handle case where user has no role
  const userRole = getUserOrgRole()
  if (userRole === 'viewer') {
    return <ViewOnlyMode />
  }
  
  return <FullComponent />
}
```

## Security Considerations

1. **Server-Side Validation**: Always validate permissions on the server side
2. **Database Policies**: Use Row Level Security (RLS) in Supabase
3. **API Protection**: Check permissions in API routes
4. **Audit Logging**: Log all permission-based actions

## Testing

```tsx
// Test different roles
describe('Role-based access', () => {
  it('should show admin features to admin users', () => {
    render(
      <RoleGuard requiredOrganizationRole="admin">
        <AdminFeature />
      </RoleGuard>
    )
    // Test expectations
  })
  
  it('should hide admin features from viewers', () => {
    render(
      <RoleGuard requiredOrganizationRole="admin">
        <AdminFeature />
      </RoleGuard>
    )
    // Test that AdminFeature is not rendered
  })
})
```

This RBAC system provides a solid foundation for controlling access to features and data throughout the application. You can extend it as needed for your specific use cases. 