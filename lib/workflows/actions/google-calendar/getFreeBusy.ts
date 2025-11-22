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
      calendarId,
      timeMin,
      timeMax,
      timeZone = 'UTC'
    } = resolvedConfig

    if (!calendarId || (Array.isArray(calendarId) && calendarId.length === 0)) {
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

    // Parse date strings - handles datetime-local format (YYYY-MM-DDTHH:mm) and ISO strings
    const parseDate = (dateStr: string): string => {
      if (!dateStr) {
        throw new Error('Date/time value is required')
      }

      // Handle relative dates (legacy support)
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

      // Try to parse as ISO string or datetime-local format
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid date format: ${dateStr}`)
        }
        return date.toISOString()
      } catch (error) {
        throw new Error(`Invalid date format: ${dateStr}`)
      }
    }

    // Process calendar IDs
    const calendarIdList = typeof calendarId === 'string'
      ? calendarId.split(',').map((id: string) => id.trim())
      : Array.isArray(calendarId)
        ? calendarId
        : [calendarId]

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

    // Helper to format date/time in a readable way
    const formatDateTime = (isoString: string): string => {
      try {
        const date = new Date(isoString)
        return date.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: timeZone
        })
      } catch {
        return isoString
      }
    }

    // Process the results to make them more user-friendly
    const calendars: Record<string, any> = {}
    const busyCalendars: string[] = []
    const freeCalendars: string[] = []
    const allBusySlots: Array<{ calendar: string; start: string; end: string; startFormatted: string; endFormatted: string; duration: string }> = []
    let totalBusySlots = 0

    for (const [calId, calendarData] of Object.entries(freeBusyData.calendars || {})) {
      const data = calendarData as any
      const busySlots = data.busy || []
      const isBusy = busySlots.length > 0

      // Track busy vs free calendars
      if (isBusy) {
        busyCalendars.push(calId)
      } else {
        freeCalendars.push(calId)
      }

      // Process each busy slot with formatted times
      const formattedBusySlots = busySlots.map((slot: any) => {
        const startDate = new Date(slot.start)
        const endDate = new Date(slot.end)
        const durationMs = endDate.getTime() - startDate.getTime()
        const durationMins = Math.round(durationMs / 60000)
        const durationStr = durationMins >= 60
          ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
          : `${durationMins}m`

        const formattedSlot = {
          start: slot.start,
          end: slot.end,
          startFormatted: formatDateTime(slot.start),
          endFormatted: formatDateTime(slot.end),
          duration: durationStr
        }

        // Add to all busy slots list
        allBusySlots.push({
          calendar: calId,
          ...formattedSlot
        })

        return formattedSlot
      })

      totalBusySlots += busySlots.length

      calendars[calId] = {
        isBusy,
        busySlotCount: busySlots.length,
        status: isBusy ? 'Busy' : 'Free',
        busySlots: formattedBusySlots,
        errors: data.errors || []
      }
    }

    // Sort all busy slots by start time
    allBusySlots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

    // Generate a human-readable summary
    const generateSummary = (): string => {
      const total = calendarIdList.length
      const busyCount = busyCalendars.length
      const freeCount = freeCalendars.length

      if (freeCount === total) {
        return `All ${total} calendar${total > 1 ? 's are' : ' is'} free during this time period.`
      } else if (busyCount === total) {
        return `All ${total} calendar${total > 1 ? 's have' : ' has'} busy time slots (${totalBusySlots} total).`
      } else {
        return `${freeCount} of ${total} calendar${freeCount > 1 ? 's are' : ' is'} free. ${busyCount} calendar${busyCount > 1 ? 's have' : ' has'} ${totalBusySlots} busy slot${totalBusySlots > 1 ? 's' : ''}.`
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
        // User-friendly summary fields
        summary: generateSummary(),
        totalCalendars: calendarIdList.length,
        freeCalendarCount: freeCalendars.length,
        busyCalendarCount: busyCalendars.length,
        totalBusySlots,
        allFree: freeCalendars.length === calendarIdList.length,
        allBusy: busyCalendars.length === calendarIdList.length,

        // Lists of calendar IDs by status
        freeCalendars,
        busyCalendars,

        // All busy time slots sorted by start time
        busyTimeSlots: allBusySlots,

        // Query info
        queryStart: formatDateTime(freeBusyData.timeMin || parseDate(timeMin)),
        queryEnd: formatDateTime(freeBusyData.timeMax || parseDate(timeMax)),
        timeZone,

        // Raw data for advanced use
        rawData: {
          calendars,
          timeMin: freeBusyData.timeMin,
          timeMax: freeBusyData.timeMax,
          queriedCalendars: calendarIdList
        }
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
