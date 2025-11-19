import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Google Calendar get free/busy information handler
 */
export async function getGoogleCalendarFreeBusy(
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
      calendarIds,
      timeMin,
      timeMax,
      timeZone = 'UTC'
    } = resolvedConfig

    if (!calendarIds || (Array.isArray(calendarIds) && calendarIds.length === 0)) {
      throw new Error('At least one calendar ID is required')
    }

    if (!timeMin) {
      throw new Error('Start time (timeMin) is required')
    }

    if (!timeMax) {
      throw new Error('End time (timeMax) is required')
    }

    // Get the decrypted access token for Google
    const accessToken = await getDecryptedAccessToken(userId, "google-calendar")

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create calendar API client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Parse date strings
    const parseDate = (dateStr: string): string => {
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
      }

      // Try to parse as ISO string or create Date object
      try {
        return new Date(dateStr).toISOString()
      } catch (error) {
        throw new Error(`Invalid date format: ${dateStr}`)
      }
    }

    // Process calendar IDs
    const calendarIdList = typeof calendarIds === 'string'
      ? calendarIds.split(',').map((id: string) => id.trim())
      : Array.isArray(calendarIds)
        ? calendarIds
        : [calendarIds]

    const items = calendarIdList.map(id => ({ id }))

    // Query free/busy information
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: parseDate(timeMin),
        timeMax: parseDate(timeMax),
        timeZone: timeZone,
        items: items
      }
    })

    const freeBusyData = response.data

    // Process the results to make them more user-friendly
    const calendars: Record<string, any> = {}

    for (const [calendarId, calendarData] of Object.entries(freeBusyData.calendars || {})) {
      const data = calendarData as any
      calendars[calendarId] = {
        busy: data.busy || [],
        errors: data.errors || [],
        isBusy: (data.busy || []).length > 0,
        busySlotCount: (data.busy || []).length
      }
    }

    logger.info('✅ [Google Calendar] Retrieved free/busy information', {
      calendarCount: calendarIdList.length,
      timeMin: parseDate(timeMin),
      timeMax: parseDate(timeMax)
    })

    return {
      success: true,
      output: {
        calendars: calendars,
        timeMin: freeBusyData.timeMin,
        timeMax: freeBusyData.timeMax,
        timeZone: timeZone,
        queriedCalendars: calendarIdList,
        calendarCount: calendarIdList.length
      }
    }
  } catch (error: any) {
    logger.error('❌ [Google Calendar] Error retrieving free/busy:', error)

    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Calendar authentication failed. Please reconnect your account.')
    }

    throw error
  }
}
