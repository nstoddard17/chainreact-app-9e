import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { ActionResult } from '../index'
import { logger } from '@/lib/utils/logger'

/**
 * End an online meeting in Microsoft Teams
 *
 * API Reference: https://learn.microsoft.com/en-us/graph/api/onlinemeeting-delete
 */
export async function endTeamsMeeting(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const { meetingId } = input

    if (!meetingId) {
      return {
        success: false,
        error: 'Meeting ID is required'
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

    // Delete the meeting
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!response.ok && response.status !== 204) {
      const errorData = await response.json()
      logger.error('[Teams] Failed to end meeting:', errorData)
      return {
        success: false,
        error: `Failed to end meeting: ${errorData.error?.message || response.statusText}`
      }
    }

    return {
      success: true,
      data: {
        success: true,
        meetingId
      }
    }
  } catch (error: any) {
    logger.error('[Teams] Error ending meeting:', error)
    return {
      success: false,
      error: error.message || 'Failed to end Teams meeting'
    }
  }
}
