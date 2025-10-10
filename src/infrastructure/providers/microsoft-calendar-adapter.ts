import { 
  CalendarProvider, 
  CalendarEvent, 
  EventResult, 
  EventFilters, 
  Calendar 
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

export class MicrosoftCalendarAdapter implements CalendarProvider {
  readonly providerId = 'microsoft-calendar'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 4, window: 1000 }, // 4 requests per second (Graph API)
      { type: 'requests', limit: 10000, window: 600000 } // 10,000 requests per 10 minutes
    ],
    supportedFeatures: [
      'create_event',
      'update_event',
      'delete_event',
      'get_events',
      'get_calendars',
      'recurring_events',
      'attendees',
      'reminders',
      'categories',
      'room_booking',
      'free_busy',
      'time_zones',
      'calendar_permissions',
      'meeting_rooms'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft')
      
      // Test Microsoft Graph API access with user info
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      return response.ok
    } catch {
      return false
    }
  }

  async createEvent(event: CalendarEvent, userId: string): Promise<EventResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft')
      
      const eventData = {
        subject: event.title,
        body: {
          contentType: 'HTML',
          content: event.description || ''
        },
        start: {
          dateTime: event.start.toISOString(),
          timeZone: 'UTC'
        },
        end: {
          dateTime: event.end.toISOString(),
          timeZone: 'UTC'
        },
        isAllDay: false,
        showAs: 'busy',
        sensitivity: 'normal',
        importance: 'normal'
      }
      
      const response = await fetch('https://graph.microsoft.com/v1.0/me/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Microsoft Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          eventId: result.id,
          title: result.subject,
          webLink: result.webLink,
          organizer: result.organizer?.emailAddress?.address,
          microsoftResponse: result
        },
        message: 'Event created successfully in Microsoft Calendar'
      }
    } catch (error: any) {
      console.error('Microsoft Calendar create event error:', error)
      return {
        success: false,
        error: error.message || 'Failed to create event in Microsoft Calendar',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async updateEvent(eventId: string, updates: Partial<CalendarEvent>, userId: string): Promise<EventResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft')
      
      const updateData: any = {}
      
      if (updates.title) {
        updateData.subject = updates.title
      }
      
      if (updates.description) {
        updateData.body = {
          contentType: 'HTML',
          content: updates.description
        }
      }
      
      if (updates.start) {
        updateData.start = {
          dateTime: updates.start.toISOString(),
          timeZone: 'UTC'
        }
      }
      
      if (updates.end) {
        updateData.end = {
          dateTime: updates.end.toISOString(),
          timeZone: 'UTC'
        }
      }
      
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to update event: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          eventId: result.id,
          title: result.subject,
          webLink: result.webLink,
          microsoftResponse: result
        },
        message: 'Event updated successfully in Microsoft Calendar'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update event in Microsoft Calendar',
        output: { error: error.message }
      }
    }
  }

  async deleteEvent(eventId: string, userId: string): Promise<void> {
    const accessToken = await getDecryptedAccessToken(userId, 'microsoft')
    
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to delete event: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }
  }

  async getEvents(filters: EventFilters, userId: string): Promise<CalendarEvent[]> {
    const accessToken = await getDecryptedAccessToken(userId, 'microsoft')
    
    const params = new URLSearchParams()
    
    if (filters.limit) {
      params.append('$top', Math.min(filters.limit, 1000).toString())
    } else {
      params.append('$top', '50')
    }
    
    // Add date range filter
    if (filters.dateRange) {
      const startFilter = `start/dateTime ge '${filters.dateRange.start.toISOString()}'`
      const endFilter = `end/dateTime le '${filters.dateRange.end.toISOString()}'`
      params.append('$filter', `${startFilter} and ${endFilter}`)
    }
    
    // Order by start time
    params.append('$orderby', 'start/dateTime')
    
    // Select specific fields for better performance
    params.append('$select', 'id,subject,body,start,end,location,organizer,attendees,webLink,createdDateTime,lastModifiedDateTime')
    
    let url = 'https://graph.microsoft.com/v1.0/me/events'
    if (filters.calendarId) {
      url = `https://graph.microsoft.com/v1.0/me/calendars/${filters.calendarId}/events`
    }
    
    const response = await fetch(`${url}?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to get events: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }
    
    const data = await response.json()
    
    return (data.value || []).map((event: any) => ({
      id: event.id,
      title: event.subject || 'Untitled Event',
      description: event.body?.content || '',
      start: new Date(event.start.dateTime),
      end: new Date(event.end.dateTime),
      location: event.location?.displayName,
      organizer: event.organizer?.emailAddress?.address,
      attendees: event.attendees?.map((attendee: any) => ({
        email: attendee.emailAddress?.address,
        name: attendee.emailAddress?.name,
        status: attendee.status?.response
      })) || [],
      webLink: event.webLink,
      metadata: {
        createdAt: event.createdDateTime ? new Date(event.createdDateTime) : undefined,
        modifiedAt: event.lastModifiedDateTime ? new Date(event.lastModifiedDateTime) : undefined,
        timeZone: event.start.timeZone || 'UTC'
      }
    }))
  }

  async getCalendars(userId: string): Promise<Calendar[]> {
    const accessToken = await getDecryptedAccessToken(userId, 'microsoft')
    
    const response = await fetch('https://graph.microsoft.com/v1.0/me/calendars', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to get calendars: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }
    
    const data = await response.json()
    
    return (data.value || []).map((calendar: any) => ({
      id: calendar.id,
      name: calendar.name,
      primary: calendar.isDefaultCalendar || false,
      color: calendar.color,
      canEdit: calendar.canEdit !== false,
      canShare: calendar.canShare !== false,
      canViewPrivateItems: calendar.canViewPrivateItems !== false,
      metadata: {
        owner: calendar.owner?.name || calendar.owner?.address,
        hexColor: calendar.hexColor,
        changeKey: calendar.changeKey
      }
    }))
  }

  // Additional Microsoft Calendar specific methods

  async getFreeBusy(emails: string[], startTime: Date, endTime: Date, userId: string): Promise<any> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft')
      
      const freeBusyData = {
        schedules: emails,
        startTime: {
          dateTime: startTime.toISOString(),
          timeZone: 'UTC'
        },
        endTime: {
          dateTime: endTime.toISOString(),
          timeZone: 'UTC'
        },
        availabilityViewInterval: 60
      }
      
      const response = await fetch('https://graph.microsoft.com/v1.0/me/calendar/getSchedule', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(freeBusyData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to get free/busy info: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      return response.json()
    } catch (error: any) {
      console.error('Microsoft Calendar free/busy error:', error)
      throw error
    }
  }

  async findMeetingTimes(attendees: string[], duration: number, maxCandidates: number, userId: string): Promise<any> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft')
      
      const findTimeData = {
        attendees: attendees.map(email => ({
          emailAddress: { address: email, name: email }
        })),
        timeConstraint: {
          timeslots: [{
            start: {
              dateTime: new Date().toISOString(),
              timeZone: 'UTC'
            },
            end: {
              dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Next 7 days
              timeZone: 'UTC'
            }
          }]
        },
        meetingDuration: `PT${duration}M`, // ISO 8601 duration format
        maxCandidates: maxCandidates || 20,
        isOrganizerOptional: false,
        returnSuggestionReasons: true
      }
      
      const response = await fetch('https://graph.microsoft.com/v1.0/me/calendar/getSchedule', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(findTimeData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to find meeting times: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      return response.json()
    } catch (error: any) {
      console.error('Microsoft Calendar find meeting times error:', error)
      throw error
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('invalid_grant')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('insufficient privileges')) {
      return 'authorization'
    }
    if (message.includes('throttled') || message.includes('too many requests')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('does not exist')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('bad request')) {
      return 'validation'
    }
    if (message.includes('conflict') || message.includes('already exists')) {
      return 'validation'
    }
    if (message.includes('mailbox full') || message.includes('quota exceeded')) {
      return 'authorization'
    }
    
    return 'unknown'
  }
}