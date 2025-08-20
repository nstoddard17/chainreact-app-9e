import { 
  CalendarProvider, 
  CalendarEvent, 
  EventResult, 
  EventFilters, 
  Calendar 
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { getGoogleCalendars } from '../../../lib/integrations/google-calendar'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'
import { google } from 'googleapis'

export class GoogleCalendarAdapter implements CalendarProvider {
  readonly providerId = 'google-calendar'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 1000, window: 100000 }, // 1000 requests per 100 seconds
      { type: 'queries', limit: 100, window: 100000 }    // 100 queries per 100 seconds
    ],
    supportedFeatures: [
      'create_event',
      'update_event',
      'delete_event',
      'get_events',
      'get_calendars',
      'recurring_events',
      'reminders'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-calendar')
      const calendars = await getGoogleCalendars(accessToken)
      return Array.isArray(calendars)
    } catch {
      return false
    }
  }

  async createEvent(event: CalendarEvent, userId: string): Promise<EventResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-calendar')
      
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
      
      const eventResource = {
        summary: event.title,
        description: event.description || '',
        start: {
          dateTime: event.start.toISOString(),
          timeZone: 'UTC'
        },
        end: {
          dateTime: event.end.toISOString(),
          timeZone: 'UTC'
        }
      }

      const response = await calendar.events.insert({
        calendarId: 'primary', // Default to primary calendar
        requestBody: eventResource
      })

      return {
        success: true,
        output: {
          eventId: response.data.id,
          title: response.data.summary,
          start: new Date(response.data.start?.dateTime || ''),
          end: new Date(response.data.end?.dateTime || ''),
          url: response.data.htmlLink,
          googleResponse: response.data
        },
        message: 'Calendar event created successfully'
      }
    } catch (error: any) {
      console.error('Google Calendar create event error:', error)
      return {
        success: false,
        error: error.message || 'Failed to create calendar event',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async updateEvent(eventId: string, updates: Partial<CalendarEvent>, userId: string): Promise<EventResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-calendar')
      
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
      
      const updateResource: any = {}
      
      if (updates.title) updateResource.summary = updates.title
      if (updates.description) updateResource.description = updates.description
      if (updates.start) {
        updateResource.start = {
          dateTime: updates.start.toISOString(),
          timeZone: 'UTC'
        }
      }
      if (updates.end) {
        updateResource.end = {
          dateTime: updates.end.toISOString(),
          timeZone: 'UTC'
        }
      }

      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        requestBody: updateResource
      })

      return {
        success: true,
        output: {
          eventId: response.data.id,
          title: response.data.summary,
          start: new Date(response.data.start?.dateTime || ''),
          end: new Date(response.data.end?.dateTime || ''),
          url: response.data.htmlLink,
          googleResponse: response.data
        },
        message: 'Calendar event updated successfully'
      }
    } catch (error: any) {
      console.error('Google Calendar update event error:', error)
      return {
        success: false,
        error: error.message || 'Failed to update calendar event',
        output: { error: error.message }
      }
    }
  }

  async deleteEvent(eventId: string, userId: string): Promise<void> {
    const accessToken = await getDecryptedAccessToken(userId, 'google-calendar')
    
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId
    })
  }

  async getEvents(filters: EventFilters, userId: string): Promise<CalendarEvent[]> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-calendar')
      
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
      
      const params: any = {
        calendarId: filters.calendarId || 'primary',
        maxResults: filters.limit || 250,
        singleEvents: true,
        orderBy: 'startTime'
      }

      if (filters.dateRange) {
        params.timeMin = filters.dateRange.start.toISOString()
        params.timeMax = filters.dateRange.end.toISOString()
      }

      const response = await calendar.events.list(params)

      return response.data.items?.map((event: any) => ({
        id: event.id,
        title: event.summary || 'Untitled Event',
        description: event.description || '',
        start: new Date(event.start?.dateTime || event.start?.date || ''),
        end: new Date(event.end?.dateTime || event.end?.date || '')
      })) || []
    } catch (error: any) {
      console.error('Google Calendar get events error:', error)
      return []
    }
  }

  async getCalendars(userId: string): Promise<Calendar[]> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-calendar')
      const calendars = await getGoogleCalendars(accessToken)
      
      return calendars.map((cal: any) => ({
        id: cal.id,
        name: cal.summary,
        primary: cal.primary || false
      }))
    } catch (error: any) {
      console.error('Google Calendar get calendars error:', error)
      return []
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('invalid credentials')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('insufficient permissions')) {
      return 'authorization'
    }
    if (message.includes('quota exceeded') || message.includes('rate limit')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('malformed')) {
      return 'validation'
    }
    
    return 'unknown'
  }
}