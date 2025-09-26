import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'

/**
 * Microsoft Outlook create calendar event handler with timezone auto-detection
 */
export async function createOutlookCalendarEvent(
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
      calendarId,
      subject,
      body,
      startDate,
      startTime,
      endDate,
      endTime,
      timeZone,
      isAllDay,
      location,
      locations,
      attendees,
      reminderMinutes,
      showAs = 'busy',
      sensitivity = 'normal',
      importance = 'normal'
    } = resolvedConfig

    // Get the decrypted access token for Microsoft Outlook
    const accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // Handle timezone - if "user-timezone" is selected, use the browser's timezone
    let eventTimeZone = timeZone
    if (timeZone === 'user-timezone' || !timeZone) {
      // Use Intl API to get the user's timezone
      eventTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      console.log(`🌍 [Outlook Calendar] Auto-detected user timezone: ${eventTimeZone}`)
    }

    // Parse dates and times with proper validation
    const parseDateTime = (date: string, time: string, isEndDate: boolean = false) => {
      // Handle special date values or use defaults
      if (!date || date === 'today') {
        date = new Date().toISOString().split('T')[0]
      } else if (date === 'same-as-start' && startDate) {
        date = startDate === 'today' ? new Date().toISOString().split('T')[0] : startDate
      }

      // Handle special time values or use defaults
      if (!time || time === 'current') {
        if (isEndDate) {
          // For end time, default to 1 hour after start
          const now = new Date()
          now.setHours(now.getHours() + 1)
          time = now.toTimeString().slice(0, 5)
        } else {
          // For start time, use current time
          time = new Date().toTimeString().slice(0, 5)
        }
      }

      // Validate time format (HH:MM)
      if (!/^\d{2}:\d{2}$/.test(time)) {
        time = '09:00' // Default to 9 AM if invalid format
      }

      // Combine date and time
      return `${date}T${time}:00`
    }

    // Prepare the event data for Microsoft Graph API
    const eventData: any = {
      subject: subject || 'Untitled Event'
    }

    // Only add body if provided
    if (body) {
      eventData.body = {
        contentType: 'HTML',
        content: body
      }
    }

    // Only add showAs if provided (default is 'busy' in Outlook)
    if (showAs) {
      eventData.showAs = showAs
    }

    // Only add sensitivity if provided (default is 'normal')
    if (sensitivity) {
      eventData.sensitivity = sensitivity
    }

    // Only add importance if provided (default is 'normal')
    if (importance) {
      eventData.importance = importance.toLowerCase()
    }

    // Handle all-day events
    if (isAllDay) {
      eventData.isAllDay = true

      // Parse start date for all-day event
      let allDayStartDate = startDate
      if (!allDayStartDate || allDayStartDate === 'today') {
        allDayStartDate = new Date().toISOString().split('T')[0]
      }

      // Parse end date for all-day event
      let allDayEndDate = endDate
      if (!allDayEndDate || allDayEndDate === 'same-as-start' || allDayEndDate === 'today') {
        allDayEndDate = allDayStartDate
      }

      eventData.start = {
        dateTime: `${allDayStartDate}T00:00:00`,
        timeZone: eventTimeZone
      }
      eventData.end = {
        dateTime: `${allDayEndDate}T00:00:00`,
        timeZone: eventTimeZone
      }
    } else {
      // Regular timed event
      eventData.start = {
        dateTime: parseDateTime(startDate, startTime, false),
        timeZone: eventTimeZone
      }
      eventData.end = {
        dateTime: parseDateTime(endDate, endTime, true),
        timeZone: eventTimeZone
      }
    }

    // Add location if provided
    if (location || locations) {
      const locationString = location || locations
      if (locationString && locationString.trim()) {
        eventData.location = {
          displayName: locationString.trim()
        }
      }
    }

    // Process attendees if provided
    if (attendees && attendees.length > 0) {
      const attendeeList = Array.isArray(attendees) ? attendees : [attendees]
      const validAttendees = attendeeList
        .filter(email => email && typeof email === 'string' && email.includes('@'))
        .map(email => ({
          emailAddress: {
            address: email.trim()
          },
          type: 'required'
        }))

      // Only add attendees if we have valid ones
      if (validAttendees.length > 0) {
        eventData.attendees = validAttendees
      }
    }

    // Add reminder if specified and valid
    if (reminderMinutes !== undefined && reminderMinutes !== null && reminderMinutes !== '') {
      const reminderValue = parseInt(reminderMinutes)
      if (!isNaN(reminderValue) && reminderValue > 0) {
        eventData.reminderMinutesBeforeStart = reminderValue
        eventData.isReminderOn = true
      }
    }

    // Determine which calendar to use
    // If no calendar selected or it's 'default', use the primary calendar
    const calendarEndpoint = calendarId && calendarId.trim() && calendarId !== 'default' && calendarId !== ''
      ? `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events`
      : 'https://graph.microsoft.com/v1.0/me/events'

    // Create the event using Microsoft Graph API
    const response = await fetch(calendarEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventData)
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to create calendar event: ${response.statusText}`

      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to create calendar event: ${errorJson.error.message}`
        }
      } catch {
        // If error text is not JSON, use the default message
      }

      throw new Error(errorMessage)
    }

    const createdEvent = await response.json()

    return {
      success: true,
      output: {
        eventId: createdEvent.id,
        subject: createdEvent.subject,
        start: createdEvent.start,
        end: createdEvent.end,
        location: createdEvent.location?.displayName,
        webLink: createdEvent.webLink,
        timezone: eventTimeZone,
        isAllDay: createdEvent.isAllDay,
        attendees: createdEvent.attendees?.map((a: any) => a.emailAddress.address),
        createdDateTime: createdEvent.createdDateTime
      }
    }
  } catch (error: any) {
    console.error('❌ [Outlook Calendar] Error creating event:', error)

    // Check if it's a token error
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      throw new Error('Microsoft Outlook authentication failed. Please reconnect your account.')
    }

    throw error
  }
}