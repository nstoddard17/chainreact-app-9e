import { google, calendar_v3 } from "googleapis"

import { logger } from '@/lib/utils/logger'

export async function getGoogleCalendars(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })

  const calendar = google.calendar({ version: "v3", auth: oauth2Client })

  try {
    const response = await calendar.calendarList.list({
      maxResults: 250, // Fetch up to 250 calendars
    })

    const calendars =
      response.data.items?.map((cal: calendar_v3.Schema$CalendarListEntry) => ({
        id: cal.id,
        summary: cal.summary,
      })) || []

    return calendars
  } catch (error) {
    logger.error("Failed to get Google calendars:", error)
    throw new Error("Failed to get Google calendars")
  }
}
