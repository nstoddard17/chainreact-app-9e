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

    // Process date/time based on the simplified field structure
    const processedConfig = { ...resolvedConfig }
    const now = new Date()
    let eventDate = new Date()

    // Calculate the date based on eventDate selection
    switch (resolvedConfig.eventDate) {
      case 'today':
        // Keep eventDate as now
        break
      case 'tomorrow':
        eventDate.setDate(eventDate.getDate() + 1)
        break
      case 'in_3_days':
        eventDate.setDate(eventDate.getDate() + 3)
        break
      case 'in_1_week':
        eventDate.setDate(eventDate.getDate() + 7)
        break
      case 'in_2_weeks':
        eventDate.setDate(eventDate.getDate() + 14)
        break
      case 'custom_days':
        const daysToAdd = parseInt(resolvedConfig.customDays) || 1
        eventDate.setDate(eventDate.getDate() + daysToAdd)
        break
      case 'next_weekday':
        if (resolvedConfig.nextWeekday) {
          const weekdayMap: { [key: string]: number } = {
            'monday': 1,
            'tuesday': 2,
            'wednesday': 3,
            'thursday': 4,
            'friday': 5,
            'saturday': 6,
            'sunday': 0
          }
          const targetDay = weekdayMap[resolvedConfig.nextWeekday]
          const currentDay = eventDate.getDay()
          const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7 // If same day, go to next week
          eventDate.setDate(eventDate.getDate() + daysUntilTarget)
        }
        break
      case 'next_monday':
        const daysUntilMonday = (1 - eventDate.getDay() + 7) % 7 || 7
        eventDate.setDate(eventDate.getDate() + daysUntilMonday)
        break
      case 'next_friday':
        const daysUntilFriday = (5 - eventDate.getDay() + 7) % 7 || 7
        eventDate.setDate(eventDate.getDate() + daysUntilFriday)
        break
      case 'specific':
        if (resolvedConfig.specificDate) {
          eventDate = new Date(`${resolvedConfig.specificDate }T00:00:00`)
        }
        break
    }

    // Format the date as YYYY-MM-DD
    const formattedDate = eventDate.toISOString().split('T')[0]

    // Handle time
    let calculatedStartTime = resolvedConfig.eventTime || '09:00'
    if (calculatedStartTime === 'current') {
      const currentHours = now.getHours().toString().padStart(2, '0')
      const currentMinutes = now.getMinutes().toString().padStart(2, '0')
      calculatedStartTime = `${currentHours}:${currentMinutes}`
    } else if (calculatedStartTime === 'custom' && resolvedConfig.customTime) {
      calculatedStartTime = resolvedConfig.customTime
    }

    // Handle duration and end time
    const duration = resolvedConfig.duration || '60'

    if (duration === 'allday') {
      processedConfig.isAllDay = true
      processedConfig.startDate = formattedDate
      processedConfig.endDate = formattedDate
      processedConfig.startTime = '00:00'
      processedConfig.endTime = '23:59'
    } else if (duration === 'custom') {
      // Use custom end date/time if provided
      processedConfig.isAllDay = false
      processedConfig.startDate = formattedDate
      processedConfig.startTime = calculatedStartTime
      processedConfig.endDate = resolvedConfig.customEndDate || formattedDate
      processedConfig.endTime = resolvedConfig.customEndTime || '17:00'
    } else {
      // Calculate end time based on duration
      processedConfig.isAllDay = false
      processedConfig.startDate = formattedDate
      processedConfig.startTime = calculatedStartTime

      const [startHours, startMinutes] = calculatedStartTime.split(':').map(Number)
      const durationMinutes = parseInt(duration)
      const totalMinutes = startHours * 60 + startMinutes + durationMinutes
      const endHours = Math.floor(totalMinutes / 60) % 24
      const endMinutes = totalMinutes % 60
      processedConfig.endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`

      // If end time goes past midnight, set end date to next day
      if (totalMinutes >= 24 * 60) {
        const endDate = new Date(eventDate)
        endDate.setDate(endDate.getDate() + Math.floor(totalMinutes / (24 * 60)))
        processedConfig.endDate = endDate.toISOString().split('T')[0]
      } else {
        processedConfig.endDate = formattedDate
      }
    }

    const {
      calendarId = 'primary',
      title,
      description,
      startDate,
      startTime,
      endDate,
      endTime,
      timeZone,
      isAllDay,
      location,
      attendees,
      reminderMinutes,
      reminderMethod = 'popup',
      createMeetLink,
      sendNotifications = 'all',
      guestsCanInviteOthers = true,
      guestsCanSeeOtherGuests = true,
      guestsCanModify = false,
      visibility = 'public',
      transparency = 'transparent',
      colorId,
      recurrence
    } = processedConfig

    // Get the decrypted access token for Google
    const accessToken = await getDecryptedAccessToken(userId, "google-calendar")

    // Handle timezone - if "user-timezone" is selected, use the browser's timezone
    let eventTimeZone = timeZone
    if (timeZone === 'user-timezone' || !timeZone) {
      // Use Intl API to get the user's timezone
      eventTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      logger.debug(`🌍 [Google Calendar] Auto-detected user timezone: ${eventTimeZone}`)
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create calendar API client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

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

    // Prepare the event data for Google Calendar API
    const eventData: any = {
      summary: title || 'Untitled Event',
      location: location,
      description: description
    }

    // Handle all-day events
    if (isAllDay) {
      eventData.start = {
        date: startDate,
        timeZone: eventTimeZone
      }
      eventData.end = {
        date: endDate || startDate,
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

    // Add reminder if specified
    if (reminderMinutes && reminderMinutes !== '0') {
      eventData.reminders = {
        useDefault: false,
        overrides: [
          {
            method: reminderMethod,
            minutes: parseInt(reminderMinutes)
          }
        ]
      }
    } else {
      eventData.reminders = {
        useDefault: false,
        overrides: []
      }
    }

    // Add Google Meet conference if requested
    if (createMeetLink) {
      eventData.conferenceData = {
        createRequest: {
          requestId: `meet_${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    }

    // Set visibility and transparency
    eventData.visibility = visibility === 'public' ? 'public' : 'private'
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

    // Create the event using Google Calendar API
    const response = await calendar.events.insert({
      calendarId: calendarId,
      requestBody: eventData,
      sendUpdates: sendUpdates,
      conferenceDataVersion: createMeetLink ? 1 : 0
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
        meetLink: createdEvent.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri,
        attendees: createdEvent.attendees,
        status: createdEvent.status,
        created: createdEvent.created,
        summary: createdEvent.summary,
        location: createdEvent.location,
        timezone: eventTimeZone
      }
    }
  } catch (error: any) {
    logger.error('❌ [Google Calendar] Error creating event:', error)

    // Check if it's a token error
    if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Calendar authentication failed. Please reconnect your account.')
    }

    throw error
  }
}