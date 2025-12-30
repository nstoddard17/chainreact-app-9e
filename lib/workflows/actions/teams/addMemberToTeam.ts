import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { ActionResult } from '../index'
import { logger } from '@/lib/utils/logger'

/**
 * Add a member to a Microsoft Teams team
 *
 * API Reference: https://learn.microsoft.com/en-us/graph/api/team-post-members
 */
export async function addTeamsMemberToTeam(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const { teamId, userEmail, role } = input

    if (!teamId || !userEmail) {
      return {
        success: false,
        error: 'Missing required fields: teamId and userEmail are required'
      }
    }

    const supabase = createAdminClient()

    // Get Teams integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'teams')
      .eq('status', 'connected')
      .single()

    if (!integration || !integration.access_token) {
      return {
        success: false,
        error: 'Teams integration not found or not connected'
      }
    }

    const accessToken = await decrypt(integration.access_token)

    // First, get the user ID from their email
    const userResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!userResponse.ok) {
      const errorData = await userResponse.json()
      logger.error('[Teams] Failed to find user:', errorData)
      return {
        success: false,
        error: `Failed to find user with email ${userEmail}: ${errorData.error?.message || userResponse.statusText}`
      }
    }

    const user = await userResponse.json()

    // Build member payload
    const memberPayload = {
      "@odata.type": "#microsoft.graph.aadUserConversationMember",
      "roles": role === 'owner' ? ['owner'] : [],
      "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${user.id}')`
    }

    // Add member to the team
    // API: POST /teams/{team-id}/members
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/teams/${teamId}/members`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(memberPayload)
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      logger.error('[Teams] Failed to add member to team:', errorData)
      return {
        success: false,
        error: `Failed to add member to team: ${errorData.error?.message || response.statusText}`
      }
    }

    const member = await response.json()

    return {
      success: true,
      data: {
        userId: user.id,
        userEmail: userEmail,
        teamId: teamId,
        role: role || 'member',
        success: true
      }
    }
  } catch (error: any) {
    logger.error('[Teams] Error adding member to team:', error)
    return {
      success: false,
      error: error.message || 'Failed to add member to Teams team'
    }
  }
}
