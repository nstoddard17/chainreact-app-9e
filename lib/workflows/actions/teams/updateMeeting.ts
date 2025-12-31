import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { ActionResult } from '../index'
import { logger } from '@/lib/utils/logger'

/**
 * Update an online meeting in Microsoft Teams
 *
 * API Reference: https://learn.microsoft.com/en-us/graph/api/onlinemeeting-update
 */
export async function updateTeamsMeeting(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Support both config and input for field values
    const meetingId = input.meetingId || config.meetingId
    const subject = input.subject || config.subject
    const startDateTime = input.startDateTime || config.startDateTime
    const endDateTime = input.endDateTime || config.endDateTime

    if (!meetingId) {
      return {
        success: false,
        error: 'Meeting ID is required'
      }
    }

    if (!subject && !startDateTime && !endDateTime) {
      return {
        success: false,
        error: 'At least one field to update is required (subject, startDateTime, or endDateTime)'
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

    // Build update payload
    const updatePayload: any = {}

    if (subject) {
      updatePayload.subject = subject
    }

    if (startDateTime) {
      updatePayload.startDateTime = new Date(startDateTime).toISOString()
    }

    if (endDateTime) {
      updatePayload.endDateTime = new Date(endDateTime).toISOString()
    }

    // Update the meeting
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatePayload)
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      logger.error('[Teams] Failed to update meeting:', errorData)
      return {
        success: false,
        error: `Failed to update meeting: ${errorData.error?.message || response.statusText}`
      }
    }

    const meeting = await response.json()

    return {
      success: true,
      output: {
        meetingId: meeting.id,
        subject: meeting.subject,
        success: true
      }
    }
  } catch (error: any) {
    logger.error('[Teams] Error updating meeting:', error)
    return {
      success: false,
      error: error.message || 'Failed to update Teams meeting'
    }
  }
}
