import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Google Calendar get event handler
 */
export async function getGoogleCalendarEvent(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve config values if they contain template variables
    const needsResolution = typeof config === 'object' &&
      Object.values(config).some(v =>
        typeof v === 'string' && v.includes('{{') && v.includes('}}')
      )

    const resolvedConfig = needsResolution ? resolveValue(config, { input }) : config

    const {
      calendarId = 'primary',
      eventId
    } = resolvedConfig

    if (!eventId) {
      throw new Error('Event ID is required to retrieve an event')
    }

    // Get the decrypted access token for Google
    const accessToken = await getDecryptedAccessToken(userId, "google-calendar")

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create calendar API client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Get the event
    const response = await calendar.events.get({
      calendarId: calendarId,
      eventId: eventId
    })

    const event = response.data

    logger.info('✅ [Google Calendar] Retrieved event', {
      eventId: event.id,
      title: event.summary
    })

    return {
      success: true,
      output: {
        eventId: event.id,
        htmlLink: event.htmlLink,
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: event.start,
        end: event.end,
        attendees: event.attendees || [],
        organizer: event.organizer,
        creator: event.creator,
        created: event.created,
        updated: event.updated,
        status: event.status,
        hangoutLink: event.hangoutLink,
        meetLink: event.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri,
        conferenceData: event.conferenceData,
        colorId: event.colorId,
        transparency: event.transparency,
        visibility: event.visibility,
        recurrence: event.recurrence,
        recurringEventId: event.recurringEventId,
        originalStartTime: event.originalStartTime,
        iCalUID: event.iCalUID,
        sequence: event.sequence,
        reminders: event.reminders,
        attachments: event.attachments,
        guestsCanInviteOthers: event.guestsCanInviteOthers,
        guestsCanModify: event.guestsCanModify,
        guestsCanSeeOtherGuests: event.guestsCanSeeOtherGuests,
        privateCopy: event.privateCopy,
        locked: event.locked,
        source: event.source,
        eventType: event.eventType
      }
    }
  } catch (error: any) {
    logger.error('❌ [Google Calendar] Error retrieving event:', error)

    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Calendar authentication failed. Please reconnect your account.')
    }

    if (error.message?.includes('404') || error.code === 404) {
      throw new Error('Event not found.')
    }

    throw error
  }
}
