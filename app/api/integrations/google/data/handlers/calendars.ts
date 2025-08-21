/**
 * Google Calendar Handler
 */

import { GoogleIntegration, GoogleCalendar, GoogleDataHandler } from '../types'
import { validateGoogleIntegration, makeGoogleApiRequest } from '../utils'

/**
 * Fetch Google Calendar calendars for the authenticated user
 */
export const getGoogleCalendars: GoogleDataHandler<GoogleCalendar> = async (integration: GoogleIntegration) => {
  try {
    validateGoogleIntegration(integration)
    console.log("📅 [Google Calendar] Fetching calendars")

    const response = await makeGoogleApiRequest(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      integration.access_token
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

    console.log(`✅ [Google Calendar] Retrieved ${calendars.length} calendars`)
    return calendars

  } catch (error: any) {
    console.error("❌ [Google Calendar] Error fetching calendars:", error)
    throw error
  }
}