import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { ActionResult } from '../index'
import { logger } from '@/lib/utils/logger'

/**
 * Create a new online meeting in Microsoft Teams
 *
 * API Reference: https://learn.microsoft.com/en-us/graph/api/application-post-onlinemeetings
 */
export async function createTeamsMeeting(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const { subject, startTime, endTime, attendees, description, allowMeetingChat, allowCamera, allowMic } = input

    if (!subject || !startTime || !endTime) {
      return {
        success: false,
        error: 'Missing required fields: subject, startTime, and endTime are required'
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

    // Build meeting payload
    const meetingPayload: any = {
      subject: subject,
      startDateTime: new Date(startTime).toISOString(),
      endDateTime: new Date(endTime).toISOString()
    }

    // Add lobby bypass settings
    meetingPayload.lobbyBypassSettings = {
      scope: 'organization',
      isDialInBypassEnabled: true
    }

    // Add audio conferencing settings
    if (allowMeetingChat !== undefined || allowCamera !== undefined || allowMic !== undefined) {
      meetingPayload.audioConferencing = {}
    }

    // Add participants if specified
    if (attendees) {
      const attendeeList = typeof attendees === 'string'
        ? attendees.split(',').map((e: string) => e.trim()).filter((e: string) => e)
        : Array.isArray(attendees) ? attendees : []

      if (attendeeList.length > 0) {
        meetingPayload.participants = {
          attendees: attendeeList.map((email: string) => ({
            upn: email,
            role: 'attendee'
          }))
        }
      }
    }

    // Create the meeting
    // API: POST /me/onlineMeetings
    const response = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(meetingPayload)
    })

    if (!response.ok) {
      const errorData = await response.json()
      logger.error('[Teams] Failed to create meeting:', errorData)
      return {
        success: false,
        error: `Failed to create meeting: ${errorData.error?.message || response.statusText}`
      }
    }

    const meeting = await response.json()

    return {
      success: true,
      data: {
        meetingId: meeting.id,
        joinUrl: meeting.joinUrl || meeting.joinWebUrl,
        subject: meeting.subject,
        startTime: meeting.startDateTime,
        endTime: meeting.endDateTime,
        success: true
      }
    }
  } catch (error: any) {
    logger.error('[Teams] Error creating meeting:', error)
    return {
      success: false,
      error: error.message || 'Failed to create Teams meeting'
    }
  }
}
