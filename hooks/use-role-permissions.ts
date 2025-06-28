"use client"

import { useAuthStore } from "@/stores/authStore"
import { type UserRole, hasPermission, canAccessFeature, getRoleInfo, getRoleLimit, isUnlimited } from "@/lib/utils/roles"

export function useRolePermissions() {
  const { profile } = useAuthStore()
  const userRole = (profile?.role as UserRole) || 'free'

  return {
    userRole,
    isAdmin: userRole === 'admin',
    isPro: userRole === 'pro' || userRole === 'business' || userRole === 'enterprise' || userRole === 'admin',
    isBusiness: userRole === 'business' || userRole === 'enterprise' || userRole === 'admin',
    isEnterprise: userRole === 'enterprise' || userRole === 'admin',
    
    // Permission checking
    hasPermission: (requiredRole: UserRole) => hasPermission(userRole, requiredRole),
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
    canCreateWorkflows: () => hasPermission(userRole, 'free'),
    canUseAdvancedIntegrations: () => hasPermission(userRole, 'pro'),
    canUseTeamFeatures: () => hasPermission(userRole, 'business'),
    canUseEnterpriseFeatures: () => hasPermission(userRole, 'enterprise'),
    canManageUsers: () => userRole === 'admin',
    
    // Feature access
    canUseAnalytics: () => canAccessFeature(userRole, 'Advanced analytics'),
    canUseAPIAccess: () => canAccessFeature(userRole, 'API access'),
    canUseCustomTemplates: () => canAccessFeature(userRole, 'Custom templates'),
    canUsePrioritySupport: () => canAccessFeature(userRole, 'Priority support'),
    canUseDedicatedSupport: () => canAccessFeature(userRole, 'Dedicated support'),
  }
} 