import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Google Calendar create event handler with timezone auto-detection
 */
export async function createGoogleCalendarEvent(
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

    // Extract all config fields with new structure
    const {
      calendarId = 'primary',
      title,
      description,
      allDay = false,
      startDate,
      startTime,
      endDate,
      endTime,
      separateTimezones = false,
      startTimeZone,
      endTimeZone,
      location,
      attendees,
      notifications = [],
      googleMeet = null,
      sendNotifications = 'all',
      guestsCanInviteOthers = true,
      guestsCanSeeOtherGuests = true,
      guestsCanModify = false,
      visibility = 'default',
      transparency = 'opaque',
      colorId,
      recurrence
    } = resolvedConfig

    // Get the decrypted access token for Google
    const accessToken = await getDecryptedAccessToken(userId, "google-calendar")

    // Handle timezone - auto-detect if not specified
    const getUserTimezone = () => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone
      } catch {
        return 'America/New_York' // fallback
      }
    }

    // Use startTimeZone for both start and end unless separateTimezones is enabled
    let eventStartTimeZone = startTimeZone || getUserTimezone()
    let eventEndTimeZone = separateTimezones && endTimeZone ? endTimeZone : eventStartTimeZone

    // Auto-detect timezone if not set or set to 'auto'
    if (!eventStartTimeZone || eventStartTimeZone === 'auto') {
      eventStartTimeZone = getUserTimezone()
      logger.debug(`🌍 [Google Calendar] Auto-detected start timezone: ${eventStartTimeZone}`)
    }

    if (separateTimezones && (!eventEndTimeZone || eventEndTimeZone === 'auto')) {
      eventEndTimeZone = getUserTimezone()
      logger.debug(`🌍 [Google Calendar] Auto-detected end timezone: ${eventEndTimeZone}`)
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create calendar API client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Parse dates and times with proper validation
    const parseDateTime = (date: string, time: string) => {
      // Handle special date values or use defaults
      if (!date || date === 'today') {
        date = new Date().toISOString().split('T')[0]
      }

      // Handle special time values or use defaults
      if (!time || time === 'current') {
        time = new Date().toTimeString().slice(0, 5)
      }

      // Validate time format (HH:MM)
      if (!/^\d{2}:\d{2}$/.test(time)) {
        time = '09:00' // Default to 9 AM if invalid format
      }

      // Combine date and time
      return `${date}T${time}:00`
    }

    // Parse date for all-day events
    const parseDate = (date: string) => {
      if (!date || date === 'today') {
        return new Date().toISOString().split('T')[0]
      }
      // If date contains time component (T or space), extract just the date part
      if (typeof date === 'string' && (date.includes('T') || date.includes(' '))) {
        return date.split('T')[0].split(' ')[0]
      }
      return date
    }

    // Prepare the event data for Google Calendar API
    const eventData: any = {
      summary: title || 'Untitled Event',
      location: location,
      description: description
    }

    // Handle all-day events
    if (allDay) {
      // For all-day events, only use date (no timeZone field)
      eventData.start = {
        date: parseDate(startDate)
      }
      eventData.end = {
        date: parseDate(endDate || startDate)
      }
    } else {
      // Regular timed event
      eventData.start = {
        dateTime: parseDateTime(startDate, startTime),
        timeZone: eventStartTimeZone
      }
      eventData.end = {
        dateTime: parseDateTime(endDate || startDate, endTime || '10:00'),
        timeZone: eventEndTimeZone
      }
    }

    // Process attendees if provided
    if (attendees && attendees.length > 0) {
      const attendeeList = typeof attendees === 'string'
        ? attendees.split(',').map((email: string) => email.trim())
        : Array.isArray(attendees) ? attendees : [attendees]

      const validAttendees = attendeeList
        .filter(email => email && email.includes('@'))
        .map(email => ({ email: email.trim() }))

      if (validAttendees.length > 0) {
        eventData.attendees = validAttendees
      }
    }

    // Add reminders from notifications array
    if (notifications && Array.isArray(notifications) && notifications.length > 0) {
      eventData.reminders = {
        useDefault: false,
        overrides: notifications.map((notif: any) => ({
          method: notif.method,
          minutes: notif.minutes
        }))
      }
    } else {
      eventData.reminders = {
        useDefault: false,
        overrides: []
      }
    }

    // Handle Google Meet conference
    let createMeetLink = false
    let existingEventId: string | null = null

    if (googleMeet && googleMeet.link) {
      createMeetLink = true

      // If we already created a placeholder event, we'll update it instead of creating new
      if (googleMeet.eventId) {
        existingEventId = googleMeet.eventId
        logger.debug(`🔄 [Google Calendar] Updating existing event ${existingEventId} with real details`)
      } else {
        // No existing event, create conference data for new event
        const conferenceRequest: any = {
          requestId: `meet_${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }

        // Apply Google Meet settings if provided
        if (googleMeet.settings) {
          const conferenceSolution: any = {}

          // Note: Google Calendar API has limited support for these settings
          // Most settings are controlled by the user's Google Workspace admin settings
          if (googleMeet.settings.accessType) {
            conferenceSolution.accessType = googleMeet.settings.accessType
          }

          if (Object.keys(conferenceSolution).length > 0) {
            conferenceRequest.conferenceSolutionKey = {
              type: 'hangoutsMeet',
              ...conferenceSolution
            }
          }
        }

        eventData.conferenceData = {
          createRequest: conferenceRequest
        }
      }
    }

    // Set visibility (handle default, public, private)
    if (visibility && visibility !== 'default') {
      eventData.visibility = visibility
    }

    // Set transparency (opaque = busy, transparent = free)
    eventData.transparency = transparency === 'opaque' ? 'opaque' : 'transparent'

    // Set color if specified
    if (colorId && colorId !== 'default') {
      eventData.colorId = colorId
    }

    // Handle recurrence
    if (recurrence && recurrence !== 'none') {
      eventData.recurrence = [recurrence]
    }

    // Guest permissions
    if (attendees && attendees.length > 0) {
      eventData.guestsCanInviteOthers = guestsCanInviteOthers
      eventData.guestsCanSeeOtherGuests = guestsCanSeeOtherGuests
      eventData.guestsCanModify = guestsCanModify
    }

    // Determine send notifications parameter
    let sendUpdates = 'none'
    if (sendNotifications === 'all') {
      sendUpdates = 'all'
    } else if (sendNotifications === 'externalOnly') {
      sendUpdates = 'externalOnly'
    }

    let createdEvent: any

    // Log the event data being sent for debugging
    logger.debug('📤 [Google Calendar] Event data being sent:', {
      allDay,
      hasExistingEventId: !!existingEventId,
      eventData: JSON.stringify(eventData, null, 2)
    })

    // If we have an existing event ID (from Google Meet button), update it instead of creating new
    if (existingEventId) {
      // First, fetch the existing event to preserve conference data
      const existingEvent = await calendar.events.get({
        calendarId: calendarId,
        eventId: existingEventId
      })

      // Preserve the existing conference data
      if (existingEvent.data.conferenceData) {
        eventData.conferenceData = existingEvent.data.conferenceData
      }

      const response = await calendar.events.update({
        calendarId: calendarId,
        eventId: existingEventId,
        requestBody: eventData,
        sendUpdates: sendUpdates,
        conferenceDataVersion: 1 // Keep the existing conference data
      })
      createdEvent = response.data
      logger.info('✅ [Google Calendar] Updated existing event with Google Meet', {
        eventId: existingEventId
      })
    } else {
      // Create a new event
      const response = await calendar.events.insert({
        calendarId: calendarId,
        requestBody: eventData,
        sendUpdates: sendUpdates,
        conferenceDataVersion: createMeetLink ? 1 : 0
      })
      createdEvent = response.data
      logger.info('✅ [Google Calendar] Created new event', {
        eventId: createdEvent.id,
        hasMeet: createMeetLink
      })
    }

    return {
      success: true,
      output: {
        eventId: createdEvent.id,
        htmlLink: createdEvent.htmlLink,
        start: createdEvent.start,
        end: createdEvent.end,
        hangoutLink: createdEvent.hangoutLink,
        meetLink: createdEvent.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri,
        attendees: createdEvent.attendees,
        status: createdEvent.status,
        created: createdEvent.created,
        summary: createdEvent.summary,
        location: createdEvent.location,
        startTimezone: eventStartTimeZone,
        endTimezone: eventEndTimeZone
      }
    }
  } catch (error: any) {
    logger.error('❌ [Google Calendar] Error creating event:', {
      message: error.message,
      code: error.code,
      errors: error.errors,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText
    })

    // Check if it's a token error
    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Calendar authentication failed. Please reconnect your account.')
    }

    // Provide more helpful error message
    if (error.response?.data?.error?.message) {
      throw new Error(`Google Calendar API Error: ${error.response.data.error.message}`)
    }

    throw error
  }
}