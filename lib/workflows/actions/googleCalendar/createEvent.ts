import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

/**
 * Create a Google Calendar event with full field support
 */
export async function createGoogleCalendarEvent(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const {
      calendarId = 'primary',
      title,
      description,
      startTime,
      endTime,
      allDay = false,
      location,
      attendees = [],
      sendNotifications = true,
      reminderMinutes,
      reminderType = 'popup',
      recurrence,
      recurrenceRule,
      color,
      visibility = 'default',
      transparency = 'opaque',
      conferenceData,
      addMeet = false,
      timeZone,
      attachments = [],
      guestsCanModify = false,
      guestsCanInviteOthers = true,
      guestsCanSeeOtherGuests = true
    } = resolvedConfig

    const accessToken = await getDecryptedAccessToken(userId, "google-calendar")
    
    // Initialize Calendar API
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Build event object
    const event: any = {
      summary: title,
      description,
      location,
      visibility,
      transparency
    }

    // Handle date/time
    if (allDay) {
      // For all-day events, use date format
      const startDate = new Date(startTime)
      const endDate = new Date(endTime || startTime)
      endDate.setDate(endDate.getDate() + 1) // End date is exclusive for all-day events
      
      event.start = {
        date: startDate.toISOString().split('T')[0],
        timeZone
      }
      event.end = {
        date: endDate.toISOString().split('T')[0],
        timeZone
      }
    } else {
      event.start = {
        dateTime: new Date(startTime).toISOString(),
        timeZone
      }
      event.end = {
        dateTime: new Date(endTime || startTime).toISOString(),
        timeZone
      }
    }

    // Add attendees
    if (attendees.length > 0) {
      event.attendees = attendees.map((email: string) => ({
        email,
        responseStatus: 'needsAction'
      }))
    }

    // Set guest permissions
    event.guestsCanModify = guestsCanModify
    event.guestsCanInviteOthers = guestsCanInviteOthers
    event.guestsCanSeeOtherGuests = guestsCanSeeOtherGuests

    // Add reminders
    if (reminderMinutes !== undefined) {
      event.reminders = {
        useDefault: false,
        overrides: [{
          method: reminderType,
          minutes: reminderMinutes
        }]
      }
    } else {
      event.reminders = { useDefault: true }
    }

    // Handle recurrence
    if (recurrence || recurrenceRule) {
      if (recurrenceRule) {
        // Custom RRULE
        event.recurrence = [recurrenceRule]
      } else if (recurrence) {
        // Simplified recurrence
        switch (recurrence) {
          case 'daily':
            event.recurrence = ['RRULE:FREQ=DAILY']
            break
          case 'weekly':
            event.recurrence = ['RRULE:FREQ=WEEKLY']
            break
          case 'monthly':
            event.recurrence = ['RRULE:FREQ=MONTHLY']
            break
          case 'yearly':
            event.recurrence = ['RRULE:FREQ=YEARLY']
            break
          case 'weekdays':
            event.recurrence = ['RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR']
            break
        }
      }
    }

    // Set event color (1-11 are valid colorIds)
    if (color) {
      const colorMap: Record<string, string> = {
        'blue': '1',
        'green': '2',
        'purple': '3',
        'red': '4',
        'yellow': '5',
        'orange': '6',
        'turquoise': '7',
        'gray': '8',
        'bold-blue': '9',
        'bold-green': '10',
        'bold-red': '11'
      }
      event.colorId = colorMap[color] || color
    }

    // Add Google Meet conference
    if (addMeet) {
      event.conferenceData = {
        createRequest: {
          requestId: `${userId}_${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    } else if (conferenceData) {
      // Custom conference data
      event.conferenceData = conferenceData
    }

    // Add attachments
    if (attachments.length > 0) {
      event.attachments = attachments.map((url: string) => ({
        fileUrl: url
      }))
    }

    // Create the event
    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
      sendNotifications,
      conferenceDataVersion: addMeet || conferenceData ? 1 : 0
    })

    const createdEvent = response.data

    return {
      success: true,
      output: {
        eventId: createdEvent.id,
        htmlLink: createdEvent.htmlLink,
        start: createdEvent.start,
        end: createdEvent.end,
        hangoutLink: createdEvent.hangoutLink,
        meetLink: createdEvent.conferenceData?.entryPoints?.find(
          (ep: any) => ep.entryPointType === 'video'
        )?.uri,
        attendees: createdEvent.attendees,
        status: createdEvent.status
      },
      message: `Event "${title}" created successfully`
    }

  } catch (error: any) {
    console.error('Create Google Calendar event error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create calendar event'
    }
  }
}