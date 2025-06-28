export type UserRole = 'free' | 'pro' | 'business' | 'enterprise' | 'admin'

export interface RoleInfo {
  name: string
  displayName: string
  color: string
  badgeColor: string
  description: string
  features: string[]
  limits: Record<string, number>
}

export const ROLES: Record<UserRole, RoleInfo> = {
  free: {
    name: 'free',
    displayName: 'Free',
    color: 'text-gray-600',
    badgeColor: 'bg-gray-100 text-gray-800',
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
    }
  },
  pro: {
    name: 'pro',
    displayName: 'Pro',
    color: 'text-blue-600',
    badgeColor: 'bg-blue-100 text-blue-800',
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
    }
  },
  business: {
    name: 'business',
    displayName: 'Business',
    color: 'text-purple-600',
    badgeColor: 'bg-purple-100 text-purple-800',
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
    }
  },
  enterprise: {
    name: 'enterprise',
    displayName: 'Enterprise',
    color: 'text-emerald-600',
    badgeColor: 'bg-emerald-100 text-emerald-800',
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
    }
  },
  admin: {
    name: 'admin',
    displayName: 'Admin',
    color: 'text-red-600',
    badgeColor: 'bg-red-100 text-red-800',
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
    }
  }
}

export const ROLE_HIERARCHY: UserRole[] = ['free', 'pro', 'business', 'enterprise', 'admin']

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