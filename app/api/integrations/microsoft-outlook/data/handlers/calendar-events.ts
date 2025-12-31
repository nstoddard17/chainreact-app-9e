/**
 * Microsoft Outlook Calendar Events Handler
 * Fetches user's calendar events from Outlook for event selection
 */

import { decryptToken } from '@/lib/integrations/tokenUtils'
import { logger } from '@/lib/utils/logger'

export interface OutlookCalendarEvent {
  value: string
  label: string
  description?: string
}

interface CalendarEventsOptions {
  calendarId?: string
  search?: string
}

/**
 * Fetch Outlook calendar events for selection
 * Returns events with their ID as value and subject/title as label
 */
export async function getOutlookCalendarEvents(
  integration: any,
  options: CalendarEventsOptions = {}
): Promise<OutlookCalendarEvent[]> {
  try {
    logger.debug('[Outlook API] Fetching calendar events for selection')

    // Get decrypted access token
    if (!integration.access_token) {
      throw new Error('No access token available')
    }
    const accessToken = await decryptToken(integration.access_token)
    if (!accessToken) {
      throw new Error('Failed to decrypt access token')
    }

    const { calendarId, search } = options

    // Use calendarView endpoint for date-range queries (more reliable than $filter on /events)
    // calendarView returns all events (including recurring) within a time range
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const sixMonthsFromNow = new Date()
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)

    // Build the calendarView endpoint
    let endpoint: string
    if (calendarId && calendarId !== 'default') {
      endpoint = `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/calendarView`
    } else {
      endpoint = 'https://graph.microsoft.com/v1.0/me/calendarView'
    }

    // Build query parameters
    const params = new URLSearchParams()
    // calendarView requires startDateTime and endDateTime
    params.append('startDateTime', thirtyDaysAgo.toISOString())
    params.append('endDateTime', sixMonthsFromNow.toISOString())
    params.append('$top', '50') // Limit to 50 events
    params.append('$orderby', 'start/dateTime desc')
    params.append('$select', 'id,subject,start,end,location,organizer')

    // Note: Microsoft Graph doesn't support $search on calendarView, so we filter client-side

    const fullEndpoint = `${endpoint}?${params.toString()}`

    const response = await fetch(fullEndpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'outlook.timezone="UTC"' // Ensure consistent timezone handling
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('[Outlook API] Failed to fetch calendar events:', errorText)
      return []
    }

    const data = await response.json()
    const events = data.value || []

    logger.debug(`[Outlook API] Found ${events.length} calendar events`)

    // Map events to the format expected by the UI
    let eventOptions: OutlookCalendarEvent[] = events.map((event: any) => {
      // Format the date for display
      const startDate = event.start?.dateTime
        ? new Date(event.start.dateTime).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          })
        : ''

      const label = event.subject || 'Untitled Event'
      const description = startDate ? `${startDate}${event.location?.displayName ? ` - ${event.location.displayName}` : ''}` : undefined

      return {
        value: event.id,
        label: label,
        description: description
      }
    })

    // Client-side search filtering if search term provided
    if (search && search.trim()) {
      const searchLower = search.toLowerCase()
      eventOptions = eventOptions.filter(event =>
        event.label.toLowerCase().includes(searchLower) ||
        (event.description && event.description.toLowerCase().includes(searchLower))
      )
    }

    return eventOptions

  } catch (error: any) {
    logger.error('[Outlook API] Failed to get calendar events:', error)
    return []
  }
}
