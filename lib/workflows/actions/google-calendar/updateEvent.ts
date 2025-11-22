import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Google Calendar update event handler
 */
export async function updateGoogleCalendarEvent(
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

    // Extract all config fields
    const {
      calendarId = 'primary',
      eventId,
      title,
      description,
      allDay,
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
      googleMeet,
      sendNotifications = 'all',
      guestsCanInviteOthers,
      guestsCanSeeOtherGuests,
      guestsCanModify,
      visibility,
      transparency,
      colorId,
      recurrence
    } = resolvedConfig

    if (!eventId) {
      throw new Error('Event ID is required to update an event')
    }

    // Check if an array was provided instead of a single event ID
    if (Array.isArray(eventId)) {
      throw new Error(
        'Multiple events detected. To update multiple events, add a Loop node before this action and use {{loop.currentItem.eventId}} as the Event ID. If you want to update only the first event, use {{list_events_node.events.0.eventId}} instead.'
      )
    }

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

    let eventStartTimeZone = startTimeZone || getUserTimezone()
    let eventEndTimeZone = separateTimezones && endTimeZone ? endTimeZone : eventStartTimeZone

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create calendar API client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // First, get the existing event
    const existingEvent = await calendar.events.get({
      calendarId: calendarId,
      eventId: eventId
    })

    // Parse dates and times with proper validation
    const parseDateTime = (date: string, time: string) => {
      if (!date || date === 'today') {
        date = new Date().toISOString().split('T')[0]
      }

      // Handle full ISO timestamps (e.g., from {{NOW}}) - extract just the date part
      if (date.includes('T')) {
        date = date.split('T')[0]
      }

      if (!time || time === 'current') {
        time = new Date().toTimeString().slice(0, 5)
      }

      if (!/^\d{2}:\d{2}$/.test(time)) {
        time = '09:00'
      }

      return `${date}T${time}:00`
    }

    const parseDate = (date: string) => {
      if (!date || date === 'today') {
        return new Date().toISOString().split('T')[0]
      }
      // Handle full ISO timestamps (e.g., from {{NOW}}) - extract just the date part
      if (date.includes('T')) {
        return date.split('T')[0]
      }
      // Handle other date formats - try to parse and format as YYYY-MM-DD
      try {
        const parsed = new Date(date)
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0]
        }
      } catch {
        // Fall through to return original
      }
      return date
    }

    // Prepare the update data - only include fields that are being changed
    const eventData: any = {}

    if (title !== undefined) {
      eventData.summary = title
    }

    if (location !== undefined) {
      eventData.location = location
    }

    if (description !== undefined) {
      eventData.description = description
    }

    // Handle date/time updates
    if (allDay !== undefined || startDate !== undefined || startTime !== undefined || endDate !== undefined || endTime !== undefined) {
      if (allDay) {
        // All-day events use 'date' property without timeZone (Google API requirement)
        const startDateStr = parseDate(startDate || existingEvent.data.start?.date || new Date().toISOString())
        const endDateStr = parseDate(endDate || startDate || existingEvent.data.end?.date || new Date().toISOString())

        // For all-day events, Google requires end date to be the day AFTER the last day of the event
        // If start and end are the same, add one day to end
        let adjustedEndDate = endDateStr
        if (startDateStr === endDateStr) {
          const endDateObj = new Date(endDateStr)
          endDateObj.setDate(endDateObj.getDate() + 1)
          adjustedEndDate = endDateObj.toISOString().split('T')[0]
        }

        eventData.start = {
          date: startDateStr
        }
        eventData.end = {
          date: adjustedEndDate
        }
      } else {
        eventData.start = {
          dateTime: parseDateTime(
            startDate || existingEvent.data.start?.dateTime?.split('T')[0] || new Date().toISOString().split('T')[0],
            startTime || existingEvent.data.start?.dateTime?.split('T')[1]?.substring(0, 5) || '09:00'
          ),
          timeZone: eventStartTimeZone
        }
        eventData.end = {
          dateTime: parseDateTime(
            endDate || startDate || existingEvent.data.end?.dateTime?.split('T')[0] || new Date().toISOString().split('T')[0],
            endTime || existingEvent.data.end?.dateTime?.split('T')[1]?.substring(0, 5) || '10:00'
          ),
          timeZone: eventEndTimeZone
        }
      }
    }

    // Process attendees if provided
    if (attendees !== undefined) {
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
      } else {
        eventData.attendees = []
      }
    }

    // Add reminders from notifications array
    if (notifications !== undefined) {
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
          useDefault: true
        }
      }
    }

    // Handle Google Meet conference updates
    if (googleMeet !== undefined) {
      if (googleMeet && googleMeet.link) {
        const conferenceRequest: any = {
          requestId: `meet_${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }

        if (googleMeet.settings) {
          const conferenceSolution: any = {}
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

    // Set visibility
    if (visibility !== undefined && visibility !== 'default') {
      eventData.visibility = visibility
    }

    // Set transparency
    if (transparency !== undefined) {
      eventData.transparency = transparency === 'opaque' ? 'opaque' : 'transparent'
    }

    // Set color
    if (colorId !== undefined && colorId !== 'default') {
      eventData.colorId = colorId
    }

    // Handle recurrence
    if (recurrence !== undefined) {
      if (recurrence && recurrence !== 'none') {
        eventData.recurrence = [recurrence]
      } else {
        eventData.recurrence = null
      }
    }

    // Guest permissions
    if (guestsCanInviteOthers !== undefined) {
      eventData.guestsCanInviteOthers = guestsCanInviteOthers
    }
    if (guestsCanSeeOtherGuests !== undefined) {
      eventData.guestsCanSeeOtherGuests = guestsCanSeeOtherGuests
    }
    if (guestsCanModify !== undefined) {
      eventData.guestsCanModify = guestsCanModify
    }

    // Determine send notifications parameter
    let sendUpdates = 'none'
    if (sendNotifications === 'all') {
      sendUpdates = 'all'
    } else if (sendNotifications === 'externalOnly') {
      sendUpdates = 'externalOnly'
    }

    // Update the event
    const response = await calendar.events.update({
      calendarId: calendarId,
      eventId: eventId,
      requestBody: eventData,
      sendUpdates: sendUpdates,
      conferenceDataVersion: googleMeet ? 1 : 0
    })

    const updatedEvent = response.data

    logger.info('✅ [Google Calendar] Updated event', {
      eventId: updatedEvent.id
    })

    return {
      success: true,
      output: {
        eventId: updatedEvent.id,
        htmlLink: updatedEvent.htmlLink,
        summary: updatedEvent.summary,
        description: updatedEvent.description,
        location: updatedEvent.location,
        start: updatedEvent.start,
        end: updatedEvent.end,
        hangoutLink: updatedEvent.hangoutLink,
        meetLink: updatedEvent.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri,
        attendees: updatedEvent.attendees,
        status: updatedEvent.status,
        updated: updatedEvent.updated,
        startTimezone: eventStartTimeZone,
        endTimezone: eventEndTimeZone
      }
    }
  } catch (error: any) {
    logger.error('❌ [Google Calendar] Error updating event:', error)

    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Calendar authentication failed. Please reconnect your account.')
    }

    throw error
  }
}
