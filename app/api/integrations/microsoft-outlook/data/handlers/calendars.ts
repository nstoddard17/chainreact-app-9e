/**
 * Microsoft Outlook Calendars Handler
 * Fetches user's calendars from Outlook
 */

import { logger } from '@/lib/utils/logger'

export interface OutlookCalendar {
  value: string
  label: string
}

/**
 * Fetch Outlook calendars
 */
export async function getOutlookCalendars(integration: any): Promise<OutlookCalendar[]> {
  try {
    logger.info(" [Outlook API] Fetching calendars")

    if (!integration.access_token) {
      throw new Error('No access token available')
    }

    // Fetch calendars from Microsoft Graph API
    const response = await fetch('https://graph.microsoft.com/v1.0/me/calendars', {
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('[Outlook API] Failed to fetch calendars:', errorText)

      // Return default calendar as fallback
      return [
        { value: 'default', label: 'Calendar' }
      ]
    }

    const data = await response.json()
    const calendars = data.value || []

    logger.info(` [Outlook API] Found ${calendars.length} calendars`)

    // Map calendars to the format expected by the UI
    const calendarOptions = calendars.map((calendar: any) => ({
      value: calendar.id,
      label: calendar.name || 'Unnamed Calendar'
    }))

    // If no calendars found, return default
    if (calendarOptions.length === 0) {
      return [
        { value: 'default', label: 'Calendar' }
      ]
    }

    return calendarOptions

  } catch (error: any) {
    logger.error(" [Outlook API] Failed to get calendars:", error)

    // Return default calendar as fallback
    return [
      { value: 'default', label: 'Calendar' }
    ]
  }
}