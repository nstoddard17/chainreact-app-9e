"use client"

import { useAuthStore } from "@/stores/authStore"
import { type UserRole, ROLE_HIERARCHY, canAccessFeature, getRoleInfo, getRoleLimit, isUnlimited } from "@/lib/utils/roles"

function isPlanAtLeast(userRole: UserRole, requiredRole: UserRole): boolean {
  if (userRole === 'admin') return true
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(requiredRole)
}

export function useRolePermissions() {
  const { profile } = useAuthStore()
  const userRole = (profile?.role as UserRole) || 'free'
  const isAdmin = profile?.admin === true

  return {
    userRole,
    isAdmin,
    isPro: userRole === 'pro' || userRole === 'business' || userRole === 'enterprise' || userRole === 'admin',
    isBusiness: userRole === 'business' || userRole === 'enterprise' || userRole === 'admin',
    isEnterprise: userRole === 'enterprise' || userRole === 'admin',

    // Permission checking
    hasPermission: (requiredRole: UserRole) => isPlanAtLeast(userRole, requiredRole),
    canAccessFeature: (feature: string) => canAccessFeature(userRole, feature),
    
    // Role information
    getRoleInfo: () => getRoleInfo(userRole),
    getRoleDisplayName: () => getRoleInfo(userRole).displayName,
    getRoleColor: () => getRoleInfo(userRole).color,
    getRoleBadgeColor: () => getRoleInfo(userRole).badgeColor,
    
    // Limits
    getLimit: (limitType: string) => getRoleLimit(userRole, limitType),
    isUnlimited: (limitType: string) => isUnlimited(userRole, limitType),
    
    // Common permission checks
    canCreateWorkflows: () => isPlanAtLeast(userRole, 'free'),
    canUseAdvancedIntegrations: () => isPlanAtLeast(userRole, 'pro'),
    canUseTeamFeatures: () => isPlanAtLeast(userRole, 'business'),
    canUseEnterpriseFeatures: () => isPlanAtLeast(userRole, 'enterprise'),
    canManageUsers: () => isAdmin,
    
    // Feature access
    canUseAnalytics: () => canAccessFeature(userRole, 'Advanced analytics'),
    canUseAPIAccess: () => canAccessFeature(userRole, 'API access'),
    canUseCustomTemplates: () => canAccessFeature(userRole, 'Custom templates'),
    canUsePrioritySupport: () => canAccessFeature(userRole, 'Priority support'),
    canUseDedicatedSupport: () => canAccessFeature(userRole, 'Dedicated support'),
  }
} 