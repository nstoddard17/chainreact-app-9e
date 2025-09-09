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
    console.log('🔵 Google Calendar createEvent - Input config:', {
      hasConfig: !!config,
      configKeys: Object.keys(config || {}),
      title: config?.title,
      startDate: config?.startDate,
      allDay: config?.allDay,
      timestamp: new Date().toISOString()
    })
    
    const resolvedConfig = resolveValue(config, { input })
    
    console.log('🎯 Google Calendar createEvent - Resolved config:')
    console.log(JSON.stringify(resolvedConfig, null, 2))
    
    // Helper function to ensure boolean values
    const toBoolean = (value: any, defaultValue: boolean = false): boolean => {
      if (typeof value === 'boolean') return value
      if (typeof value === 'string') {
        const lower = value.toLowerCase()
        if (lower === 'true' || lower === '1' || lower === 'yes') return true
        if (lower === 'false' || lower === '0' || lower === 'no') return false
        // For 'all' or other non-boolean strings, use default
        return defaultValue
      }
      return defaultValue
    }
    
    const {
      calendarId = 'primary',
      title,
      description,
      startDate,
      startTime,
      endDate,
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
      createMeetLink = false,
      timeZone,
      attachments = [],
      guestsCanModify = false,
      guestsCanInviteOthers = true,
      guestsCanSeeOtherGuests = true
    } = resolvedConfig
    
    // Handle timezone - if "Local Time Zone" is selected, use the user's actual timezone
    let effectiveTimeZone = timeZone
    if (timeZone === 'Local Time Zone' || timeZone === 'user-timezone') {
      // Use Intl.DateTimeFormat to get the user's timezone
      effectiveTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
      console.log(`🌍 Using detected local timezone: ${effectiveTimeZone}`)
    }

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

    // Handle date/time with validation
    const now = new Date()
    const defaultStartTime = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour from now
    const defaultEndTime = new Date(defaultStartTime.getTime() + 60 * 60 * 1000) // 2 hours from now
    
    console.log('📆 Date/Time Processing:')
    console.log('Current time:', now.toISOString())
    console.log('Raw startDate value:', startDate)
    console.log('Raw startTime value:', startTime)
    console.log('Raw endDate value:', endDate)
    console.log('Raw endTime value:', endTime)
    console.log('All Day:', allDay)
    
    // Helper function to combine date and time values
    const combineDateAndTime = (dateValue: any, timeValue: any, defaultDateTime: Date): Date => {
      console.log(`Combining date "${dateValue}" with time "${timeValue}"`)
      
      // Handle special date values
      let baseDate = new Date()
      if (dateValue === 'today') {
        baseDate = new Date()
        baseDate.setHours(0, 0, 0, 0)
      } else if (dateValue === 'same-as-start' && startDate) {
        // Use the start date as base
        baseDate = combineDateAndTime(startDate, '00:00', defaultDateTime)
        baseDate.setHours(0, 0, 0, 0)
      } else if (dateValue) {
        // Parse date value - if it's a date string like "2025-09-05", parse it in local time
        try {
          // Check if it's a date-only string (YYYY-MM-DD)
          if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
            // Parse as local date by adding time component
            const [year, month, day] = dateValue.split('-').map(Number)
            baseDate = new Date(year, month - 1, day, 0, 0, 0, 0)
            console.log(`Parsed date string "${dateValue}" as local date:`, baseDate.toISOString())
          } else {
            // Parse as regular date
            baseDate = new Date(dateValue)
            if (isNaN(baseDate.getTime())) {
              baseDate = new Date()
            }
            baseDate.setHours(0, 0, 0, 0)
          }
        } catch (e) {
          console.warn('Failed to parse date:', dateValue)
          baseDate = new Date()
          baseDate.setHours(0, 0, 0, 0)
        }
      }
      
      // Handle special time values
      if (timeValue === 'next-hour') {
        const nextHour = new Date()
        nextHour.setMinutes(0, 0, 0)
        nextHour.setHours(nextHour.getHours() + 1)
        baseDate.setHours(nextHour.getHours(), nextHour.getMinutes(), 0, 0)
      } else if (timeValue === '1-hour-after-start') {
        // This will be handled after we know the start time
        const tempTime = new Date(defaultStartTime)
        baseDate.setHours(tempTime.getHours(), tempTime.getMinutes(), 0, 0)
      } else if (timeValue === 'current' || timeValue === 'now') {
        const currentTime = new Date()
        baseDate.setHours(currentTime.getHours(), currentTime.getMinutes(), 0, 0)
      } else if (timeValue) {
        // Parse time in HH:MM format or other formats
        const timeMatch = timeValue.match(/(\d{1,2}):(\d{2})/)
        if (timeMatch) {
          baseDate.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0)
        } else {
          // Try to parse as a full date/time
          try {
            const fullDateTime = new Date(timeValue)
            if (!isNaN(fullDateTime.getTime())) {
              baseDate.setHours(fullDateTime.getHours(), fullDateTime.getMinutes(), 0, 0)
            }
          } catch (e) {
            console.warn('Failed to parse time:', timeValue)
          }
        }
      }
      
      console.log(`Combined result:`, baseDate.toISOString())
      return baseDate
    }
    
    const isAllDay = toBoolean(allDay, false)
    console.log('Is All Day Event:', isAllDay)
    
    if (isAllDay) {
      // For all-day events, use date only (ignore time)
      let eventStartDate = combineDateAndTime(startDate, null, defaultStartTime)
      let eventEndDate = endDate === 'same-as-start' 
        ? new Date(eventStartDate) 
        : combineDateAndTime(endDate, null, defaultEndTime)
      
      console.log('All-day event - Initial parsed dates:')
      console.log('Start Date:', eventStartDate.toISOString())
      console.log('End Date:', eventEndDate.toISOString())
      
      // For single-day all-day events, start and end should be the same
      // Google Calendar will automatically handle it as all-day
      if (endDate === 'same-as-start' || eventEndDate.toDateString() === eventStartDate.toDateString()) {
        // For a single day event, end date should be start date + 1 day
        eventEndDate = new Date(eventStartDate)
        eventEndDate.setDate(eventEndDate.getDate() + 1)
        console.log('Single day all-day event - end date set to next day:', eventEndDate.toISOString())
      } else {
        // For multi-day events, ensure end date is after start date
        if (eventEndDate <= eventStartDate) {
          eventEndDate = new Date(eventStartDate.getTime() + 24 * 60 * 60 * 1000) // Next day
          console.log('Adjusted end date to be after start:', eventEndDate.toISOString())
        }
        // End date is exclusive, so add 1 day
        eventEndDate.setDate(eventEndDate.getDate() + 1)
        console.log('Multi-day event - final end date (exclusive):', eventEndDate.toISOString())
      }
      
      // Use local date string to avoid UTC conversion issues
      const formatLocalDate = (date: Date): string => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
      
      event.start = {
        date: formatLocalDate(eventStartDate)
      }
      event.end = {
        date: formatLocalDate(eventEndDate)
      }
      
      console.log('All-day event dates being sent:')
      console.log('Start:', event.start)
      console.log('End:', event.end)
      
      // Add the effective timezone
      if (effectiveTimeZone) {
        event.start.timeZone = effectiveTimeZone
        event.end.timeZone = effectiveTimeZone
      }
    } else {
      // For timed events, combine date and time
      let startDateTime = combineDateAndTime(startDate, startTime, defaultStartTime)
      
      // Handle special end time case
      let endDateTime: Date
      if (endTime === '1-hour-after-start') {
        endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000)
      } else if (endDate === 'same-as-start') {
        endDateTime = combineDateAndTime(startDate, endTime, defaultEndTime)
      } else {
        endDateTime = combineDateAndTime(endDate, endTime, defaultEndTime)
      }
      
      console.log('Timed event - Initial parsed dates:')
      console.log('Start DateTime:', startDateTime.toISOString())
      console.log('End DateTime:', endDateTime.toISOString())
      
      // Ensure end time is after start time
      if (endDateTime <= startDateTime) {
        endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000) // 1 hour after start
        console.log('Adjusted end time to be after start:', endDateTime.toISOString())
      }
      
      event.start = {
        dateTime: startDateTime.toISOString()
      }
      event.end = {
        dateTime: endDateTime.toISOString()
      }
      
      console.log('Timed event dates being sent:')
      console.log('Start:', event.start)
      console.log('End:', event.end)
      
      // Add the effective timezone
      if (effectiveTimeZone) {
        event.start.timeZone = effectiveTimeZone
        event.end.timeZone = effectiveTimeZone
        console.log('Applied timezone:', effectiveTimeZone)
      }
    }

    // Process attendees - handle string (comma-separated) or array
    let attendeesList: string[] = []
    if (attendees) {
      if (typeof attendees === 'string') {
        // Split comma-separated string and filter out empty strings
        attendeesList = attendees.split(',').map(email => email.trim()).filter(email => email.length > 0)
      } else if (Array.isArray(attendees)) {
        attendeesList = attendees.filter(email => email && email.length > 0)
      }
    }
    
    console.log('📧 Processing attendees:', {
      originalType: typeof attendees,
      originalValue: attendees,
      processedCount: attendeesList.length,
      processedList: attendeesList
    })
    
    // Add attendees and guest permissions only when there are attendees
    if (attendeesList.length > 0) {
      event.attendees = attendeesList.map((email: string) => ({
        email,
        responseStatus: 'needsAction'
      }))
      
      // Only set guest permissions when there are actual guests
      event.guestsCanModify = toBoolean(guestsCanModify, false)
      event.guestsCanInviteOthers = toBoolean(guestsCanInviteOthers, true)
      event.guestsCanSeeOtherGuests = toBoolean(guestsCanSeeOtherGuests, true)
    }

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
    const shouldAddMeet = toBoolean(addMeet || createMeetLink, false)
    if (shouldAddMeet) {
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

    // Log the event object before sending
    console.log('📅 Google Calendar event object being sent:', JSON.stringify(event, null, 2))
    console.log('📍 Calendar ID:', calendarId)
    
    // Handle sendNotifications value
    let shouldSendNotifications = true
    if (sendNotifications === 'none' || sendNotifications === false) {
      shouldSendNotifications = false
    } else if (sendNotifications === 'all' || sendNotifications === 'externalOnly' || sendNotifications === true) {
      shouldSendNotifications = true
    }
    console.log('📧 Send notifications:', shouldSendNotifications)
    
    // Create the event
    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
      sendNotifications: shouldSendNotifications,
      conferenceDataVersion: (shouldAddMeet || conferenceData) ? 1 : 0
    })

    const createdEvent = response.data
    
    // Log the API response to verify event creation
    console.log('✅ Google Calendar API Response:')
    console.log('Event ID:', createdEvent.id)
    console.log('HTML Link:', createdEvent.htmlLink)
    console.log('Event Status:', createdEvent.status)
    console.log('Start:', JSON.stringify(createdEvent.start))
    console.log('End:', JSON.stringify(createdEvent.end))
    console.log('Created Event Full Response:', JSON.stringify(createdEvent, null, 2))

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
