"use client"

import { ReactNode } from "react"
import { useAuthStore } from "@/stores/authStore"
import { useOrganizationStore } from "@/stores/organizationStore"
import { hasPermission, type UserRole } from "@/lib/utils/roles"
import { hasOrganizationPermission, type OrganizationRole } from "@/lib/utils/organizationRoles"

interface RoleGuardProps {
  children: ReactNode
  requiredRole?: UserRole
  requiredOrganizationRole?: OrganizationRole
  requiredPermission?: string
  fallback?: ReactNode
  showFallback?: boolean
}

export function RoleGuard({ 
  children, 
  requiredRole, 
  requiredOrganizationRole,
  requiredPermission,
  fallback = null,
  showFallback = false 
}: RoleGuardProps) {
  const { profile } = useAuthStore()
  const { currentOrganization } = useOrganizationStore()
  
  const userRole = (profile?.role || 'free') as UserRole
  
  // Check if user has required system role
  if (requiredRole && !hasPermission(userRole, requiredRole)) {
    return showFallback ? <>{fallback}</> : null
  }
  
  // Check if user has required organization role
  if (requiredOrganizationRole && currentOrganization) {
    // Find user's role in current organization
    const userMember = currentOrganization.members?.find(
      (member: any) => member.user_id === profile?.id
    )
    const userOrgRole = userMember?.role as OrganizationRole || 'viewer'
    
    if (userOrgRole !== requiredOrganizationRole && userOrgRole !== 'admin') {
      return showFallback ? <>{fallback}</> : null
    }
  }
  
  // Check if user has required permission
  if (requiredPermission && currentOrganization) {
    const userMember = currentOrganization.members?.find(
      (member: any) => member.user_id === profile?.id
    )
    const userOrgRole = userMember?.role as OrganizationRole || 'viewer'
    
    if (!hasOrganizationPermission(userOrgRole, requiredPermission)) {
      return showFallback ? <>{fallback}</> : null
    }
  }
  
  return <>{children}</>
}

interface PermissionGuardProps {
  children: ReactNode
  permission: string
  fallback?: ReactNode
  showFallback?: boolean
}

export function PermissionGuard({ 
  children, 
  permission, 
  fallback = null, 
  showFallback = false 
}: PermissionGuardProps) {
  return (
    <RoleGuard 
      requiredPermission={permission} 
      fallback={fallback} 
      showFallback={showFallback}
    >
      {children}
    </RoleGuard>
  )
}

interface OrganizationRoleGuardProps {
  children: ReactNode
  requiredRole: OrganizationRole
  fallback?: ReactNode
  showFallback?: boolean
}

export function OrganizationRoleGuard({ 
  children, 
  requiredRole, 
  fallback = null, 
  showFallback = false 
}: OrganizationRoleGuardProps) {
  return (
    <RoleGuard 
      requiredOrganizationRole={requiredRole} 
      fallback={fallback} 
      showFallback={showFallback}
    >
      {children}
    </RoleGuard>
  )
} 