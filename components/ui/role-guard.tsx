"use client"

import { ReactNode } from "react"
import { useAuthStore } from "@/stores/authStore"
import { useOrganizationStore } from "@/stores/organizationStore"
import { type UserRole, ROLE_HIERARCHY } from "@/lib/utils/roles"
import { hasMembershipPermission, type OrgRole } from "@/lib/types/roles"
import { isProfileAdmin } from "@/lib/types/admin"

interface RoleGuardProps {
  children: ReactNode
  requiredRole?: UserRole
  requiredOrganizationRole?: OrgRole
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

  const isAdmin = isProfileAdmin(profile)
  const userRole = isAdmin ? 'admin' : ((profile?.role || 'free') as UserRole)

  // Check if user has required system role (plan tier)
  if (requiredRole) {
    if (userRole !== 'admin') {
      const userIndex = ROLE_HIERARCHY.indexOf(userRole)
      const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole)
      if (userIndex < requiredIndex) {
        return showFallback ? <>{fallback}</> : null
      }
    }
  }

  // Check if user has required organization role
  if (requiredOrganizationRole && currentOrganization) {
    const userMember = currentOrganization.members?.find(
      (member: any) => member.user_id === profile?.id
    )
    const userOrgRole = (userMember?.role || 'member') as OrgRole

    if (!hasMembershipPermission(userOrgRole, requiredOrganizationRole, true)) {
      return showFallback ? <>{fallback}</> : null
    }
  }

  // Check if user has required permission (org-level)
  if (requiredPermission && currentOrganization) {
    const userMember = currentOrganization.members?.find(
      (member: any) => member.user_id === profile?.id
    )
    const userOrgRole = (userMember?.role || 'member') as OrgRole

    if (!hasMembershipPermission(userOrgRole, requiredPermission, true)) {
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
  requiredRole: OrgRole
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
