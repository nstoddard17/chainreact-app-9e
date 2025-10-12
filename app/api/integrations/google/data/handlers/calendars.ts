/**
 * Google Calendar Handler
 */

import { GoogleIntegration, GoogleCalendar, GoogleDataHandler } from '../types'
import { validateGoogleIntegration, makeGoogleApiRequest, getGoogleAccessToken } from '../utils'

import { logger } from '@/lib/utils/logger'

/**
 * Fetch Google Calendar calendars for the authenticated user
 */
export const getGoogleCalendars: GoogleDataHandler<GoogleCalendar> = async (integration: GoogleIntegration) => {
  try {
    validateGoogleIntegration(integration)
    logger.debug("📅 [Google Calendar] Fetching calendars")

    const accessToken = getGoogleAccessToken(integration)
    const response = await makeGoogleApiRequest(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      accessToken
    )

    const data = await response.json()

    const calendars = (data.items || []).map((calendar: any): GoogleCalendar => ({
      id: calendar.id,
      name: calendar.summary,
      value: calendar.id,
      description: calendar.description,
      primary: calendar.primary,
      access_role: calendar.accessRole,
      background_color: calendar.backgroundColor,
      foreground_color: calendar.foregroundColor,
      selected: calendar.selected,
      summary: calendar.summary,
      time_zone: calendar.timeZone,
    }))

    logger.debug(`✅ [Google Calendar] Retrieved ${calendars.length} calendars`)
    return calendars

  } catch (error: any) {
    logger.error("❌ [Google Calendar] Error fetching calendars:", error)
    throw error
  }
}

/**
 * Fetch events from a specific Google Calendar
 */
export const getGoogleCalendarEvents: GoogleDataHandler = async (
  integration: GoogleIntegration,
  options?: any
): Promise<any[]> => {
  try {
    validateGoogleIntegration(integration)

    // Get calendarId from options (passed from dependent field)
    const calendarId = options?.calendarId || options?.dependsOnValue

    logger.debug("📅 [Google Calendar] Fetching events from calendar:", calendarId)

    if (!calendarId) {
      logger.debug("📅 [Google Calendar] No calendarId provided, returning empty array")
      return []
    }

    const accessToken = getGoogleAccessToken(integration)

    // Get events from the next 30 days and past 7 days
    const now = new Date()
    const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '100'
    })

    const response = await makeGoogleApiRequest(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      accessToken
    )

    const data = await response.json()

    // Format events with detailed information for easy display
    const events = (data.items || []).map((event: any) => {
      const startDate = event.start?.dateTime || event.start?.date
      const endDate = event.end?.dateTime || event.end?.date

      // Format date/time for display
      let displayDate = ''
      if (event.start?.dateTime) {
        const start = new Date(event.start.dateTime)
        const end = new Date(event.end.dateTime)
        const dateOptions: Intl.DateTimeFormatOptions = {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }
        const timeOptions: Intl.DateTimeFormatOptions = {
          hour: 'numeric',
          minute: '2-digit'
        }

        displayDate = `${start.toLocaleDateString('en-US', dateOptions)} ${start.toLocaleTimeString('en-US', timeOptions)} - ${end.toLocaleTimeString('en-US', timeOptions)}`
      } else if (event.start?.date) {
        // All-day event
        const start = new Date(`${event.start.date }T00:00:00`)
        const dateOptions: Intl.DateTimeFormatOptions = {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }
        displayDate = `${start.toLocaleDateString('en-US', dateOptions)} (All day)`
      }

      // Build a descriptive label with all important info
      const attendeeCount = event.attendees?.length || 0
      const location = event.location ? ` 📍 ${event.location}` : ''
      const attendeeInfo = attendeeCount > 0 ? ` 👥 ${attendeeCount} attendee${attendeeCount !== 1 ? 's' : ''}` : ''
      const recurring = event.recurringEventId ? ' 🔁' : ''

      return {
        id: event.id,
        value: event.id,
        label: `${event.summary || 'Untitled Event'}`,
        name: `${event.summary || 'Untitled Event'} - ${displayDate}${location}${attendeeInfo}${recurring}`,
        description: displayDate,
        // Include full event data for potential use
        summary: event.summary,
        start: startDate,
        end: endDate,
        location: event.location,
        attendees: event.attendees,
        organizer: event.organizer,
        status: event.status,
        htmlLink: event.htmlLink,
        recurringEventId: event.recurringEventId,
        created: event.created,
        updated: event.updated,
      }
    })

    logger.debug(`✅ [Google Calendar] Retrieved ${events.length} events`)
    return events

  } catch (error: any) {
    logger.error("❌ [Google Calendar] Error fetching events:", error)
    // Return empty array on error to avoid breaking the UI
    return []
  }
}