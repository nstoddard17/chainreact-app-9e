export type UserRole = 'free' | 'pro' | 'beta-pro' | 'business' | 'enterprise' | 'admin'

export interface RoleInfo {
  name: string
  displayName: string
  color: string
  badgeColor: string
  description: string
  features: string[]
  limits: Record<string, number>
  allowedPages: string[]
  isSecret?: boolean
}

export const ROLES: Record<UserRole, RoleInfo> = {
  free: {
    name: 'free',
    displayName: 'Free',
    color: 'text-green-600 dark:text-green-400',
    badgeColor: 'bg-green-500 text-white dark:bg-green-600 dark:text-white border border-green-600 dark:border-green-500',
    description: 'Basic features for individual users',
    features: [
      'Up to 3 workflows',
      'Basic integrations',
      'Email support'
    ],
    limits: {
      workflows: 3,
      integrations: 5,
      executions: 100
    },
    allowedPages: ['/dashboard', '/workflows', '/integrations', '/learn', '/community', '/profile', '/settings']
  },
  pro: {
    name: 'pro',
    displayName: 'Pro',
    color: 'text-blue-600 dark:text-blue-400',
    badgeColor: 'bg-blue-500 text-white dark:bg-blue-600 dark:text-white border border-blue-600 dark:border-blue-500',
    description: 'Advanced features for power users',
    features: [
      'Up to 20 workflows',
      'Advanced integrations',
      'Priority support',
      'Custom templates'
    ],
    limits: {
      workflows: 20,
      integrations: 15,
      executions: 1000
    },
    allowedPages: ['/dashboard', '/workflows', '/integrations', '/learn', '/community', '/analytics', '/profile', '/settings']
  },
  'beta-pro': {
    name: 'beta-pro',
    displayName: 'Beta-Pro',
    color: 'text-blue-600 dark:text-blue-400',
    badgeColor: 'bg-blue-500 text-white dark:bg-blue-600 dark:text-white border border-blue-600 dark:border-blue-500',
    description: 'Beta testing Pro features',
    features: [
      'Up to 20 workflows',
      'Advanced integrations',
      'Priority support',
      'Custom templates',
      'Early access to new features'
    ],
    limits: {
      workflows: 20,
      integrations: 15,
      executions: 1000
    },
    allowedPages: ['/dashboard', '/workflows', '/integrations', '/learn', '/community', '/analytics', '/profile', '/settings'],
    isSecret: true
  },
  business: {
    name: 'business',
    displayName: 'Business',
    color: 'text-purple-600 dark:text-purple-400',
    badgeColor: 'bg-indigo-500 text-white dark:bg-indigo-600 dark:text-white border border-indigo-600 dark:border-indigo-500',
    description: 'Team collaboration and advanced features',
    features: [
      'Unlimited workflows',
      'Team collaboration',
      'Advanced analytics',
      'API access',
      'Dedicated support'
    ],
    limits: {
      workflows: -1, // unlimited
      integrations: 50,
      executions: 10000
    },
    allowedPages: ['/dashboard', '/workflows', '/integrations', '/learn', '/community', '/analytics', '/teams', '/profile', '/settings']
  },
  enterprise: {
    name: 'enterprise',
    displayName: 'Enterprise',
    color: 'text-emerald-600 dark:text-emerald-400',
    badgeColor: 'bg-pink-500 text-white dark:bg-pink-600 dark:text-white border border-pink-600 dark:border-pink-500',
    description: 'Full enterprise features and support',
    features: [
      'Everything in Business',
      'Custom integrations',
      'SLA guarantees',
      'On-premise deployment',
      '24/7 support'
    ],
    limits: {
      workflows: -1, // unlimited
      integrations: -1, // unlimited
      executions: -1 // unlimited
    },
    allowedPages: ['/dashboard', '/workflows', '/integrations', '/learn', '/community', '/analytics', '/teams', '/enterprise', '/profile', '/settings']
  },
  admin: {
    name: 'admin',
    displayName: 'Admin',
    color: 'text-red-600 dark:text-red-400',
    badgeColor: 'bg-red-500 text-white dark:bg-red-600 dark:text-white border border-red-600 dark:border-red-500',
    description: 'Full system access and privileges',
    features: [
      'All features',
      'User management',
      'System administration',
      'Full access'
    ],
    limits: {
      workflows: -1,
      integrations: -1,
      executions: -1
    },
    allowedPages: ['/dashboard', '/workflows', '/integrations', '/learn', '/community', '/analytics', '/teams', '/enterprise', '/admin', '/profile', '/settings']
  }
}

export const ROLE_HIERARCHY: UserRole[] = ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin']

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  if (userRole === 'admin') return true
  
  const userIndex = ROLE_HIERARCHY.indexOf(userRole)
  const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole)
  
  return userIndex >= requiredIndex
}

export function getRoleInfo(role: UserRole): RoleInfo {
  return ROLES[role] || ROLES.free
}

export function getRoleDisplayName(role: UserRole): string {
  return getRoleInfo(role).displayName
}

export function getRoleColor(role: UserRole): string {
  return getRoleInfo(role).color
}

export function getRoleBadgeColor(role: UserRole): string {
  return getRoleInfo(role).badgeColor
}

export function canAccessFeature(userRole: UserRole, feature: string): boolean {
  const roleInfo = getRoleInfo(userRole)
  return roleInfo.features.includes(feature) || userRole === 'admin'
}

export function getRoleLimit(userRole: UserRole, limitType: string): number {
  const roleInfo = getRoleInfo(userRole)
  return roleInfo.limits[limitType] || 0
}

export function isUnlimited(userRole: UserRole, limitType: string): boolean {
  return getRoleLimit(userRole, limitType) === -1
}

export function canAccessPage(userRole: UserRole, pagePath: string): boolean {
  const roleInfo = getRoleInfo(userRole)
  
  // Admin has access to all pages
  if (userRole === 'admin') return true
  
  // Check if the page is in the allowed pages list
  return roleInfo.allowedPages.includes(pagePath)
}

export function getAccessiblePages(userRole: UserRole): string[] {
  const roleInfo = getRoleInfo(userRole)
  return roleInfo.allowedPages
} 