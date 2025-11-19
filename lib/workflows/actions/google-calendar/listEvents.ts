import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Google Calendar list events handler
 */
export async function listGoogleCalendarEvents(
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

    const resolvedConfig = needsResolution ? resolveValue(config, input) : config

    const {
      calendarId = 'primary',
      timeMin,
      timeMax,
      maxResults = 250,
      orderBy = 'startTime',
      singleEvents = true,
      showDeleted = false,
      query
    } = resolvedConfig

    // Get the decrypted access token for Google
    const accessToken = await getDecryptedAccessToken(userId, "google-calendar")

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create calendar API client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Parse date strings
    const parseDate = (dateStr: string | undefined): string | undefined => {
      if (!dateStr) return undefined

      // Handle relative dates
      if (dateStr === 'today') {
        return new Date().toISOString()
      } else if (dateStr === 'tomorrow') {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        return tomorrow.toISOString()
      } else if (dateStr === 'next_week') {
        const nextWeek = new Date()
        nextWeek.setDate(nextWeek.getDate() + 7)
        return nextWeek.toISOString()
      } else if (dateStr === 'next_month') {
        const nextMonth = new Date()
        nextMonth.setMonth(nextMonth.getMonth() + 1)
        return nextMonth.toISOString()
      }

      // Try to parse as ISO string or create Date object
      try {
        return new Date(dateStr).toISOString()
      } catch (error) {
        return undefined
      }
    }

    const params: any = {
      calendarId: calendarId,
      maxResults: Math.min(maxResults, 2500), // Google's max is 2500
      singleEvents: singleEvents,
      orderBy: singleEvents ? orderBy : undefined, // orderBy only works with singleEvents=true
      showDeleted: showDeleted
    }

    if (timeMin) {
      params.timeMin = parseDate(timeMin)
    }

    if (timeMax) {
      params.timeMax = parseDate(timeMax)
    }

    if (query) {
      params.q = query
    }

    // List events
    const response = await calendar.events.list(params)

    const events = response.data.items || []

    logger.info('✅ [Google Calendar] Listed events', {
      calendarId,
      count: events.length,
      timeMin: params.timeMin,
      timeMax: params.timeMax
    })

    // Transform events to a simplified format
    const transformedEvents = events.map(event => ({
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
      meetLink: event.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri,
      conferenceData: event.conferenceData,
      colorId: event.colorId,
      transparency: event.transparency,
      visibility: event.visibility,
      recurrence: event.recurrence,
      recurringEventId: event.recurringEventId,
      eventType: event.eventType
    }))

    return {
      success: true,
      output: {
        events: transformedEvents,
        count: transformedEvents.length,
        nextPageToken: response.data.nextPageToken,
        nextSyncToken: response.data.nextSyncToken,
        calendarId: calendarId,
        timeMin: params.timeMin,
        timeMax: params.timeMax
      }
    }
  } catch (error: any) {
    logger.error('❌ [Google Calendar] Error listing events:', error)

    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Calendar authentication failed. Please reconnect your account.')
    }

    throw error
  }
}
