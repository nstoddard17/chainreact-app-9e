/**
 * Integration Permission Service
 *
 * Manages workspace-scoped integration permissions.
 * Integrations can be personal, team-scoped, or organization-scoped.
 *
 * Permission Levels:
 * - 'use': Can use integration in workflows (all team members)
 * - 'manage': Can reconnect, view details (team managers)
 * - 'admin': Can connect, disconnect, manage permissions (team owners/admins)
 *
 * Created: 2025-10-28
 */

import { getSupabaseClient } from '@/lib/supabase'
import { queryWithTimeout } from '@/lib/utils/fetch-with-timeout'
import { logger } from '@/lib/utils/logger'

// ================================================================
// TYPES
// ================================================================

export type IntegrationPermissionLevel = 'use' | 'manage' | 'admin'

export type WorkspaceType = 'personal' | 'organization' | 'team'

export interface IntegrationPermission {
  id: string
  integration_id: string
  user_id: string
  permission: IntegrationPermissionLevel
  granted_at: string
  granted_by: string | null
}

export interface IntegrationAdmin {
  user_id: string
  email: string
  full_name: string | null
}

export interface WorkspaceContext {
  type: WorkspaceType
  id?: string // organization_id or team_id (null for personal)
}

// ================================================================
// PERMISSION CHECKS
// ================================================================

/**
 * Check if user can use integration in workflows (any permission level)
 */
export async function canUserUseIntegration(
  userId: string,
  integrationId: string
): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    logger.error('Supabase client not available')
    return false
  }

  try {
    const { data, error } = await queryWithTimeout(
      supabase.rpc('can_user_use_integration', {
        p_user_id: userId,
        p_integration_id: integrationId
      }),
      8000
    )

    if (error) {
      logger.error('Error checking use permission:', error)
      return false
    }

    return data === true
  } catch (error: any) {
    logger.error('Exception checking use permission:', error)
    return false
  }
}

/**
 * Check if user can manage integration (reconnect, view details)
 */
export async function canUserManageIntegration(
  userId: string,
  integrationId: string
): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    logger.error('Supabase client not available')
    return false
  }

  try {
    const { data, error } = await queryWithTimeout(
      supabase.rpc('can_user_manage_integration', {
        p_user_id: userId,
        p_integration_id: integrationId
      }),
      8000
    )

    if (error) {
      logger.error('Error checking manage permission:', error)
      return false
    }

    return data === true
  } catch (error: any) {
    logger.error('Exception checking manage permission:', error)
    return false
  }
}

/**
 * Check if user can admin integration (connect, disconnect, permissions)
 */
export async function canUserAdminIntegration(
  userId: string,
  integrationId: string
): Promise<boolean> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    logger.error('Supabase client not available')
    return false
  }

  try {
    const { data, error } = await queryWithTimeout(
      supabase.rpc('can_user_admin_integration', {
        p_user_id: userId,
        p_integration_id: integrationId
      }),
      8000
    )

    if (error) {
      logger.error('Error checking admin permission:', error)
      return false
    }

    return data === true
  } catch (error: any) {
    logger.error('Exception checking admin permission:', error)
    return false
  }
}

/**
 * Get user's permission level for an integration
 */
export async function getUserIntegrationPermission(
  userId: string,
  integrationId: string
): Promise<IntegrationPermissionLevel | null> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    logger.error('Supabase client not available')
    return null
  }

  try {
    const { data, error } = await queryWithTimeout(
      supabase.rpc('get_user_integration_permission', {
        p_user_id: userId,
        p_integration_id: integrationId
      }),
      8000
    )

    if (error) {
      logger.error('Error getting permission level:', error)
      return null
    }

    return data as IntegrationPermissionLevel | null
  } catch (error: any) {
    logger.error('Exception getting permission level:', error)
    return null
  }
}

// ================================================================
// PERMISSION MANAGEMENT
// ================================================================

/**
 * Grant permission to a user for an integration
 */
export async function grantIntegrationPermission(
  integrationId: string,
  userId: string,
  permission: IntegrationPermissionLevel,
  grantedBy: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { success: false, error: 'Supabase client not available' }
  }

  try {
    const { error } = await queryWithTimeout(
      supabase
        .from('integration_permissions')
        .insert({
          integration_id: integrationId,
          user_id: userId,
          permission,
          granted_by: grantedBy
        }),
      8000
    )

    if (error) {
      logger.error('Error granting permission:', error)
      return { success: false, error: error.message }
    }

    logger.info(`Granted ${permission} permission to user ${userId} for integration ${integrationId}`)
    return { success: true }
  } catch (error: any) {
    logger.error('Exception granting permission:', error)
    return { success: false, error: error.message || 'Unknown error' }
  }
}

/**
 * Revoke permission from a user for an integration
 */
export async function revokeIntegrationPermission(
  integrationId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { success: false, error: 'Supabase client not available' }
  }

  try {
    const { error } = await queryWithTimeout(
      supabase
        .from('integration_permissions')
        .delete()
        .eq('integration_id', integrationId)
        .eq('user_id', userId),
      8000
    )

    if (error) {
      logger.error('Error revoking permission:', error)
      return { success: false, error: error.message }
    }

    logger.info(`Revoked permission from user ${userId} for integration ${integrationId}`)
    return { success: true }
  } catch (error: any) {
    logger.error('Exception revoking permission:', error)
    return { success: false, error: error.message || 'Unknown error' }
  }
}

/**
 * Update permission level for a user
 */
export async function updateIntegrationPermission(
  integrationId: string,
  userId: string,
  newPermission: IntegrationPermissionLevel
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { success: false, error: 'Supabase client not available' }
  }

  try {
    const { error } = await queryWithTimeout(
      supabase
        .from('integration_permissions')
        .update({ permission: newPermission })
        .eq('integration_id', integrationId)
        .eq('user_id', userId),
      8000
    )

    if (error) {
      logger.error('Error updating permission:', error)
      return { success: false, error: error.message }
    }

    logger.info(`Updated permission to ${newPermission} for user ${userId} on integration ${integrationId}`)
    return { success: true }
  } catch (error: any) {
    logger.error('Exception updating permission:', error)
    return { success: false, error: error.message || 'Unknown error' }
  }
}

// ================================================================
// AUTO-GRANT PERMISSIONS FOR NEW INTEGRATIONS
// ================================================================

/**
 * Auto-grant permissions when a new integration is connected
 *
 * Personal: Grant admin to owner
 * Team: Grant admin to team admins, use to all members
 * Organization: Grant admin to org owner, use to all org members
 */
export async function autoGrantPermissionsForIntegration(
  integrationId: string,
  workspaceContext: WorkspaceContext,
  connectedBy: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { success: false, error: 'Supabase client not available' }
  }

  try {
    // 1. Always grant 'admin' to the person who connected it
    await grantIntegrationPermission(integrationId, connectedBy, 'admin', connectedBy)

    // 2. Personal integration - only connector has access
    if (workspaceContext.type === 'personal') {
      logger.info(`Personal integration ${integrationId} - granted admin to ${connectedBy}`)
      return { success: true }
    }

    // 3. Team integration - grant permissions to all team members
    if (workspaceContext.type === 'team' && workspaceContext.id) {
      const { data: members, error: membersError } = await queryWithTimeout(
        supabase
          .from('team_members')
          .select('user_id, role')
          .eq('team_id', workspaceContext.id),
        8000
      )

      if (membersError) {
        logger.error('Error fetching team members:', membersError)
        return { success: false, error: membersError.message }
      }

      if (members && members.length > 0) {
        const permissions = members
          .filter(m => m.user_id !== connectedBy) // Skip connector (already granted)
          .map(member => ({
            integration_id: integrationId,
            user_id: member.user_id,
            permission: ['owner', 'admin'].includes(member.role) ? 'admin' : 'use',
            granted_by: connectedBy
          }))

        if (permissions.length > 0) {
          const { error: insertError } = await queryWithTimeout(
            supabase
              .from('integration_permissions')
              .insert(permissions),
            8000
          )

          if (insertError) {
            logger.error('Error inserting team permissions:', insertError)
            return { success: false, error: insertError.message }
          }

          logger.info(`Team integration ${integrationId} - granted permissions to ${permissions.length} members`)
        }
      }

      return { success: true }
    }

    // 4. Organization integration - grant permissions to all org members
    if (workspaceContext.type === 'organization' && workspaceContext.id) {
      // Get all teams in organization
      const { data: teams, error: teamsError } = await queryWithTimeout(
        supabase
          .from('teams')
          .select('id')
          .eq('organization_id', workspaceContext.id),
        8000
      )

      if (teamsError) {
        logger.error('Error fetching org teams:', teamsError)
        return { success: false, error: teamsError.message }
      }

      if (teams && teams.length > 0) {
        const teamIds = teams.map(t => t.id)

        // Get all members of all teams
        const { data: members, error: membersError } = await queryWithTimeout(
          supabase
            .from('team_members')
            .select('user_id, role')
            .in('team_id', teamIds),
          8000
        )

        if (membersError) {
          logger.error('Error fetching org members:', membersError)
          return { success: false, error: membersError.message }
        }

        // Get organization owner
        const { data: org, error: orgError } = await queryWithTimeout(
          supabase
            .from('organizations')
            .select('owner_id')
            .eq('id', workspaceContext.id)
            .single(),
          8000
        )

        if (orgError) {
          logger.error('Error fetching organization:', orgError)
          return { success: false, error: orgError.message }
        }

        // Deduplicate members and assign permissions
        const uniqueMembers = new Map<string, 'admin' | 'use'>()

        // Organization owner gets admin
        if (org?.owner_id) {
          uniqueMembers.set(org.owner_id, 'admin')
        }

        // Process team members
        if (members) {
          for (const member of members) {
            if (member.user_id === connectedBy) continue // Skip connector

            // Team admins/owners get admin, others get use
            if (['owner', 'admin'].includes(member.role)) {
              uniqueMembers.set(member.user_id, 'admin')
            } else if (!uniqueMembers.has(member.user_id)) {
              uniqueMembers.set(member.user_id, 'use')
            }
          }
        }

        const permissions = Array.from(uniqueMembers.entries()).map(([userId, permission]) => ({
          integration_id: integrationId,
          user_id: userId,
          permission,
          granted_by: connectedBy
        }))

        if (permissions.length > 0) {
          const { error: insertError } = await queryWithTimeout(
            supabase
              .from('integration_permissions')
              .insert(permissions),
            8000
          )

          if (insertError) {
            logger.error('Error inserting org permissions:', insertError)
            return { success: false, error: insertError.message }
          }

          logger.info(`Organization integration ${integrationId} - granted permissions to ${permissions.length} members`)
        }
      }

      return { success: true }
    }

    return { success: true }
  } catch (error: any) {
    logger.error('Exception auto-granting permissions:', error)
    return { success: false, error: error.message || 'Unknown error' }
  }
}

// ================================================================
// GET INTEGRATION ADMINS (for permission denial messages)
// ================================================================

/**
 * Get list of admins who can manage an integration
 * Used to display helpful messages when user doesn't have permission
 */
export async function getIntegrationAdmins(
  integrationId: string
): Promise<IntegrationAdmin[]> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    logger.error('Supabase client not available')
    return []
  }

  try {
    const { data, error } = await queryWithTimeout(
      supabase.rpc('get_integration_admins', {
        p_integration_id: integrationId
      }),
      8000
    )

    if (error) {
      logger.error('Error getting integration admins:', error)
      return []
    }

    return (data || []) as IntegrationAdmin[]
  } catch (error: any) {
    logger.error('Exception getting integration admins:', error)
    return []
  }
}

// ================================================================
// ASSERT FUNCTIONS (throw errors if not authorized)
// ================================================================

/**
 * Assert user can admin integration (throws if not)
 */
export async function assertCanAdminIntegration(
  userId: string,
  integrationId: string
): Promise<void> {
  const canAdmin = await canUserAdminIntegration(userId, integrationId)

  if (!canAdmin) {
    throw new Error('Not authorized to manage this integration')
  }
}

/**
 * Assert user can manage integration (throws if not)
 */
export async function assertCanManageIntegration(
  userId: string,
  integrationId: string
): Promise<void> {
  const canManage = await canUserManageIntegration(userId, integrationId)

  if (!canManage) {
    throw new Error('Not authorized to manage this integration')
  }
}

/**
 * Assert user can use integration (throws if not)
 */
export async function assertCanUseIntegration(
  userId: string,
  integrationId: string
): Promise<void> {
  const canUse = await canUserUseIntegration(userId, integrationId)

  if (!canUse) {
    throw new Error('Not authorized to use this integration')
  }
}
