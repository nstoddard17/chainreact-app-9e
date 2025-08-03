export type OrganizationRole = 'admin' | 'editor' | 'viewer'

export interface OrganizationPermission {
  name: string
  description: string
  allowedRoles: OrganizationRole[]
}

export const ORGANIZATION_PERMISSIONS: Record<string, OrganizationPermission> = {
  // Organization Management
  'organization.delete': {
    name: 'Delete Organization',
    description: 'Can delete the entire organization',
    allowedRoles: ['admin']
  },
  'organization.settings': {
    name: 'Manage Organization Settings',
    description: 'Can modify organization name, description, logo, and billing',
    allowedRoles: ['admin']
  },
  'organization.analytics': {
    name: 'View Organization Analytics',
    description: 'Can view detailed analytics and reports',
    allowedRoles: ['admin', 'editor']
  },

  // Member Management
  'members.invite': {
    name: 'Invite Members',
    description: 'Can invite new members to the organization',
    allowedRoles: ['admin', 'editor']
  },
  'members.remove': {
    name: 'Remove Members',
    description: 'Can remove members from the organization',
    allowedRoles: ['admin']
  },
  'members.roles': {
    name: 'Manage Member Roles',
    description: 'Can change member roles and permissions',
    allowedRoles: ['admin']
  },
  'members.view': {
    name: 'View Members',
    description: 'Can view the member list',
    allowedRoles: ['admin', 'editor', 'viewer']
  },

  // Workflow Management
  'workflows.create': {
    name: 'Create Workflows',
    description: 'Can create new workflows',
    allowedRoles: ['admin', 'editor']
  },
  'workflows.edit': {
    name: 'Edit Workflows',
    description: 'Can modify existing workflows',
    allowedRoles: ['admin', 'editor']
  },
  'workflows.delete': {
    name: 'Delete Workflows',
    description: 'Can delete workflows',
    allowedRoles: ['admin']
  },
  'workflows.share': {
    name: 'Share Workflows',
    description: 'Can share workflows publicly or with other organizations',
    allowedRoles: ['admin']
  },
  'workflows.view': {
    name: 'View Workflows',
    description: 'Can view and run workflows',
    allowedRoles: ['admin', 'editor', 'viewer']
  },

  // Integration Management
  'integrations.create': {
    name: 'Create Integrations',
    description: 'Can create and configure integrations',
    allowedRoles: ['admin', 'editor']
  },
  'integrations.edit': {
    name: 'Edit Integrations',
    description: 'Can modify integration settings',
    allowedRoles: ['admin', 'editor']
  },
  'integrations.delete': {
    name: 'Delete Integrations',
    description: 'Can remove integrations',
    allowedRoles: ['admin']
  },
  'integrations.view': {
    name: 'View Integrations',
    description: 'Can view integration configurations',
    allowedRoles: ['admin', 'editor', 'viewer']
  },

  // Data & Analytics
  'data.export': {
    name: 'Export Data',
    description: 'Can export workflow data and analytics',
    allowedRoles: ['admin']
  },
  'data.view': {
    name: 'View Data',
    description: 'Can view workflow execution data',
    allowedRoles: ['admin', 'editor', 'viewer']
  },

  // Audit & Logs
  'audit.view': {
    name: 'View Audit Logs',
    description: 'Can view activity logs and audit trails',
    allowedRoles: ['admin']
  },

  // Templates
  'templates.create': {
    name: 'Create Templates',
    description: 'Can create workflow templates',
    allowedRoles: ['admin', 'editor']
  },
  'templates.share': {
    name: 'Share Templates',
    description: 'Can share templates with the community',
    allowedRoles: ['admin']
  },
  'templates.view': {
    name: 'View Templates',
    description: 'Can view and use templates',
    allowedRoles: ['admin', 'editor', 'viewer']
  }
}

export const ORGANIZATION_ROLE_HIERARCHY: OrganizationRole[] = ['viewer', 'editor', 'admin']

export function hasOrganizationPermission(userRole: OrganizationRole, permission: string): boolean {
  const permissionInfo = ORGANIZATION_PERMISSIONS[permission]
  if (!permissionInfo) return false
  
  return permissionInfo.allowedRoles.includes(userRole)
}

export function getOrganizationRoleInfo(role: OrganizationRole) {
  const roleInfo = {
    admin: {
      name: 'Admin',
      description: 'Full control over the organization',
      color: 'text-red-600 dark:text-red-400',
      badgeColor: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
      icon: '👑'
    },
    editor: {
      name: 'Editor',
      description: 'Can create and edit workflows',
      color: 'text-blue-600 dark:text-blue-400',
      badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      icon: '✏️'
    },
    viewer: {
      name: 'Viewer',
      description: 'Can view and run workflows',
      color: 'text-green-600 dark:text-green-400',
      badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      icon: '👁️'
    }
  }
  
  return roleInfo[role]
}

export function canManageMembers(userRole: OrganizationRole): boolean {
  return hasOrganizationPermission(userRole, 'members.invite') || 
         hasOrganizationPermission(userRole, 'members.remove') ||
         hasOrganizationPermission(userRole, 'members.roles')
}

export function canManageWorkflows(userRole: OrganizationRole): boolean {
  return hasOrganizationPermission(userRole, 'workflows.create') ||
         hasOrganizationPermission(userRole, 'workflows.edit') ||
         hasOrganizationPermission(userRole, 'workflows.delete')
}

export function canViewAnalytics(userRole: OrganizationRole): boolean {
  return hasOrganizationPermission(userRole, 'organization.analytics')
}

export function getOrganizationPermissions(userRole: OrganizationRole): string[] {
  return Object.keys(ORGANIZATION_PERMISSIONS).filter(permission => 
    hasOrganizationPermission(userRole, permission)
  )
}

export function getOrganizationRoleDisplayName(role: OrganizationRole): string {
  return getOrganizationRoleInfo(role).name
}

export function getOrganizationRoleColor(role: OrganizationRole): string {
  return getOrganizationRoleInfo(role).color
}

export function getOrganizationRoleBadgeColor(role: OrganizationRole): string {
  return getOrganizationRoleInfo(role).badgeColor
} 