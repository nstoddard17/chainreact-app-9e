/**
 * Type definitions for the two-tier role system
 */

// Organization-level roles
export type OrgRole = 'owner' | 'admin' | 'manager' | 'hr' | 'finance'

// Team-level roles
export type TeamRole = 'owner' | 'admin' | 'manager' | 'hr' | 'finance' | 'lead' | 'member' | 'guest'

// Organization member interface
export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: OrgRole
  created_at: string
  updated_at: string
  user?: {
    email: string
    username?: string
  }
}

// Team member interface (extended)
export interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: TeamRole
  created_at: string
  updated_at: string
  user?: {
    email: string
    username?: string
  }
}

// Role descriptions for UI
export const ORG_ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner: 'Full control of the organization, including billing and deletion',
  admin: 'Manage teams, users, and settings (cannot delete organization)',
  manager: 'Oversee operations and view analytics',
  hr: 'Manage user onboarding, offboarding, and invitations',
  finance: 'Manage billing, subscriptions, and view usage costs'
}

export const TEAM_ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  owner: 'Full control of the team (and billing for standalone teams)',
  admin: 'Manage team settings and members',
  manager: 'Manage workflows and team operations',
  hr: 'Manage team member onboarding and invitations',
  finance: 'Manage billing for standalone teams',
  lead: 'Lead projects and moderate team activity',
  member: 'Regular team contributor',
  guest: 'Limited access external collaborator'
}

// Permission sets
export const ORG_PERMISSIONS = {
  owner: ['*'], // All permissions
  admin: ['manage_teams', 'manage_members', 'manage_settings', 'view_billing'],
  manager: ['view_analytics', 'view_teams'],
  hr: ['invite_members', 'remove_members', 'view_members'],
  finance: ['manage_billing', 'view_usage', 'view_costs']
} as const

export const TEAM_PERMISSIONS = {
  owner: ['*'], // All permissions
  admin: ['manage_settings', 'manage_members', 'view_billing'],
  manager: ['manage_workflows', 'view_analytics'],
  hr: ['invite_members', 'remove_members'],
  finance: ['manage_billing', 'view_usage'], // Only for standalone teams
  lead: ['manage_tasks', 'moderate'],
  member: ['view_team', 'create_workflows'],
  guest: ['view_team']
} as const

// Helper function to check if a role has a specific permission
export function hasPermission(
  role: OrgRole | TeamRole,
  permission: string,
  isOrgLevel: boolean
): boolean {
  const permissions = isOrgLevel
    ? ORG_PERMISSIONS[role as OrgRole]
    : TEAM_PERMISSIONS[role as TeamRole]

  if (!permissions) return false
  if (permissions.includes('*')) return true
  return permissions.includes(permission)
}

// Role hierarchy for determining highest role
export const ORG_ROLE_HIERARCHY: Record<OrgRole, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  hr: 2,
  finance: 2
}

export const TEAM_ROLE_HIERARCHY: Record<TeamRole, number> = {
  owner: 8,
  admin: 7,
  manager: 6,
  hr: 5,
  finance: 5,
  lead: 4,
  member: 3,
  guest: 1
}

// Get highest role from a list
export function getHighestOrgRole(roles: OrgRole[]): OrgRole | null {
  if (roles.length === 0) return null
  return roles.reduce((highest, current) =>
    ORG_ROLE_HIERARCHY[current] > ORG_ROLE_HIERARCHY[highest] ? current : highest
  )
}

export function getHighestTeamRole(roles: TeamRole[]): TeamRole | null {
  if (roles.length === 0) return null
  return roles.reduce((highest, current) =>
    TEAM_ROLE_HIERARCHY[current] > TEAM_ROLE_HIERARCHY[highest] ? current : highest
  )
}
