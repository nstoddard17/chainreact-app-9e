/**
 * Microsoft Outlook Calendars Handler
 * Fetches user's calendars from Outlook
 */

import { decryptToken } from '@/lib/integrations/tokenUtils'

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
    logger.debug(" [Outlook API] Fetching calendars")

    // Get decrypted access token
    if (!integration.access_token) {
      throw new Error('No access token available')
    }
    const accessToken = await decryptToken(integration.access_token)
    if (!accessToken) {
      throw new Error('Failed to decrypt access token')
    }

    // Fetch calendars from Microsoft Graph API
    const response = await fetch('https://graph.microsoft.com/v1.0/me/calendars', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
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

    logger.debug(` [Outlook API] Found ${calendars.length} calendars`)

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