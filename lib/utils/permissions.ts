/**
 * Permission helper functions for checking org-level and team-level roles
 */

import { createSupabaseServiceClient } from "@/utils/supabase/server"

export type OrgRole = 'owner' | 'admin' | 'manager' | 'hr' | 'finance'
export type TeamRole = 'owner' | 'admin' | 'manager' | 'hr' | 'finance' | 'lead' | 'member' | 'guest'

/**
 * Check if a user has a specific organization-level role
 */
export async function hasOrgPermission(
  userId: string,
  orgId: string,
  requiredRoles: OrgRole[]
): Promise<boolean> {
  try {
    const supabase = await createSupabaseServiceClient()

    const { data, error } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !data) {
      return false
    }

    return requiredRoles.includes(data.role as OrgRole)
  } catch (error) {
    console.error('Error checking org permission:', error)
    return false
  }
}

/**
 * Check if a user has a specific team-level role
 */
export async function hasTeamPermission(
  userId: string,
  teamId: string,
  requiredRoles: TeamRole[]
): Promise<boolean> {
  try {
    const supabase = await createSupabaseServiceClient()

    const { data, error } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !data) {
      return false
    }

    return requiredRoles.includes(data.role as TeamRole)
  } catch (error) {
    console.error('Error checking team permission:', error)
    return false
  }
}

/**
 * Check if a user can manage billing for a team
 * For standalone teams: team owner/admin/finance
 * For org teams: org owner/admin/finance
 */
export async function canManageBilling(
  userId: string,
  teamId: string
): Promise<boolean> {
  try {
    const supabase = await createSupabaseServiceClient()

    // Get team to check if it's standalone or part of an org
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('organization_id')
      .eq('id', teamId)
      .single()

    if (teamError || !team) {
      return false
    }

    // Standalone team - check team-level roles
    if (!team.organization_id) {
      return hasTeamPermission(userId, teamId, ['owner', 'admin', 'finance'])
    }

    // Team in org - check org-level roles
    return hasOrgPermission(userId, team.organization_id, ['owner', 'admin', 'finance'])
  } catch (error) {
    console.error('Error checking billing permission:', error)
    return false
  }
}

/**
 * Check if a user is a member of an organization (either via org-level role or team membership)
 */
export async function isOrgMember(
  userId: string,
  orgId: string
): Promise<boolean> {
  try {
    const supabase = await createSupabaseServiceClient()

    // Check org-level membership
    const { data: orgMember } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .maybeSingle()

    if (orgMember) {
      return true
    }

    // Check team membership
    const { data: teamMember } = await supabase
      .from('teams')
      .select(`
        id,
        team_members!inner(user_id)
      `)
      .eq('organization_id', orgId)
      .eq('team_members.user_id', userId)
      .limit(1)
      .maybeSingle()

    return !!teamMember
  } catch (error) {
    console.error('Error checking org membership:', error)
    return false
  }
}

/**
 * Get a user's organization-level role
 */
export async function getOrgRole(
  userId: string,
  orgId: string
): Promise<OrgRole | null> {
  try {
    const supabase = await createSupabaseServiceClient()

    const { data, error } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    return data.role as OrgRole
  } catch (error) {
    console.error('Error getting org role:', error)
    return null
  }
}

/**
 * Get a user's team-level role
 */
export async function getTeamRole(
  userId: string,
  teamId: string
): Promise<TeamRole | null> {
  try {
    const supabase = await createSupabaseServiceClient()

    const { data, error } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    return data.role as TeamRole
  } catch (error) {
    console.error('Error getting team role:', error)
    return null
  }
}

/**
 * Check if a team is standalone (not part of an organization)
 */
export async function isStandaloneTeam(teamId: string): Promise<boolean> {
  try {
    const supabase = await createSupabaseServiceClient()

    const { data, error } = await supabase
      .from('teams')
      .select('organization_id')
      .eq('id', teamId)
      .single()

    if (error || !data) {
      return false
    }

    return data.organization_id === null
  } catch (error) {
    console.error('Error checking if team is standalone:', error)
    return false
  }
}

/**
 * Check if a user can manage organization settings
 */
export async function canManageOrgSettings(
  userId: string,
  orgId: string
): Promise<boolean> {
  return hasOrgPermission(userId, orgId, ['owner', 'admin'])
}

/**
 * Check if a user can manage team settings
 */
export async function canManageTeamSettings(
  userId: string,
  teamId: string
): Promise<boolean> {
  return hasTeamPermission(userId, teamId, ['owner', 'admin'])
}

/**
 * Check if a user can invite members to an organization
 */
export async function canInviteOrgMembers(
  userId: string,
  orgId: string
): Promise<boolean> {
  return hasOrgPermission(userId, orgId, ['owner', 'admin', 'hr'])
}

/**
 * Check if a user can invite members to a team
 */
export async function canInviteTeamMembers(
  userId: string,
  teamId: string
): Promise<boolean> {
  return hasTeamPermission(userId, teamId, ['owner', 'admin', 'hr'])
}
