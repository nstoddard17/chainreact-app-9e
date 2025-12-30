import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { refreshMicrosoftToken } from '../core/refreshMicrosoftToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Update an existing Outlook calendar event
 */
export async function updateOutlookCalendarEvent(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const {
      eventId,
      calendarId,
      subject,
      body,
      startDateTime,
      endDateTime,
      location,
      attendees
    } = resolvedConfig

    if (!eventId) {
      throw new Error('Event ID is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // Build update payload - only include fields that are provided
    const updateData: any = {}

    if (subject !== undefined && subject !== '') {
      updateData.subject = subject
    }

    if (body !== undefined && body !== '') {
      updateData.body = {
        contentType: 'HTML',
        content: body
      }
    }

    if (startDateTime) {
      // Detect timezone
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      updateData.start = {
        dateTime: startDateTime,
        timeZone
      }
    }

    if (endDateTime) {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      updateData.end = {
        dateTime: endDateTime,
        timeZone
      }
    }

    if (location !== undefined && location !== '') {
      updateData.location = {
        displayName: location
      }
    }

    if (attendees && attendees.length > 0) {
      const attendeeList = Array.isArray(attendees) ? attendees : [attendees]
      updateData.attendees = attendeeList
        .filter((email: string) => email && email.includes('@'))
        .map((email: string) => ({
          emailAddress: { address: email.trim() },
          type: 'required'
        }))
    }

    // Determine endpoint based on calendar selection
    const endpoint = calendarId && calendarId !== 'default'
      ? `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events/${eventId}`
      : `https://graph.microsoft.com/v1.0/me/events/${eventId}`

    const makeRequest = async (token: string) => {
      return fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to update calendar event: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to update calendar event: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const updatedEvent = await response.json()

    return {
      success: true,
      output: {
        id: updatedEvent.id,
        updated: true,
        subject: updatedEvent.subject,
        start: updatedEvent.start,
        end: updatedEvent.end,
        location: updatedEvent.location?.displayName,
        webLink: updatedEvent.webLink
      }
    }
  } catch (error: any) {
    logger.error('[Outlook Calendar] Error updating event:', error)
    throw error
  }
}

/**
 * Delete an Outlook calendar event
 */
export async function deleteOutlookCalendarEvent(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { eventId, calendarId, sendCancellation = true } = resolvedConfig

    if (!eventId) {
      throw new Error('Event ID is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // Determine endpoint based on calendar selection
    const endpoint = calendarId && calendarId !== 'default'
      ? `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events/${eventId}`
      : `https://graph.microsoft.com/v1.0/me/events/${eventId}`

    // If sendCancellation is false, we need to cancel it differently
    // Microsoft Graph doesn't have a direct way to skip cancellation emails
    // The DELETE method will send cancellation notices by default

    const makeRequest = async (token: string) => {
      return fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok && response.status !== 204) {
      const errorText = await response.text()
      let errorMessage = `Failed to delete calendar event: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to delete calendar event: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    return {
      success: true,
      output: {
        deleted: true,
        eventId,
        cancellationSent: sendCancellation !== false && sendCancellation !== 'false'
      }
    }
  } catch (error: any) {
    logger.error('[Outlook Calendar] Error deleting event:', error)
    throw error
  }
}

/**
 * Add attendees to an existing calendar event
 */
export async function addOutlookAttendees(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { eventId, calendarId, attendees, sendInvitation = true } = resolvedConfig

    if (!eventId) {
      throw new Error('Event ID is required')
    }
    if (!attendees || attendees.length === 0) {
      throw new Error('At least one attendee is required')
    }

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // First, get the current event to preserve existing attendees
    const getEndpoint = calendarId && calendarId !== 'default'
      ? `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events/${eventId}`
      : `https://graph.microsoft.com/v1.0/me/events/${eventId}`

    const getRequest = async (token: string) => {
      return fetch(getEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
    }

    let getResponse = await getRequest(accessToken)

    if (getResponse.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      getResponse = await getRequest(accessToken)
    }

    if (!getResponse.ok) {
      throw new Error(`Failed to get event: ${getResponse.statusText}`)
    }

    const currentEvent = await getResponse.json()
    const existingAttendees = currentEvent.attendees || []

    // Process new attendees
    const attendeeList = Array.isArray(attendees) ? attendees : [attendees]
    const newAttendees = attendeeList
      .filter((email: string) => email && email.includes('@'))
      .map((email: string) => ({
        emailAddress: { address: email.trim() },
        type: 'required'
      }))

    // Merge existing and new attendees (avoid duplicates)
    const existingEmails = new Set(
      existingAttendees.map((a: any) => a.emailAddress?.address?.toLowerCase())
    )
    const mergedAttendees = [
      ...existingAttendees,
      ...newAttendees.filter((a: any) => !existingEmails.has(a.emailAddress.address.toLowerCase()))
    ]

    // Update the event with merged attendees
    const updateEndpoint = getEndpoint

    const updateRequest = async (token: string) => {
      return fetch(updateEndpoint, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ attendees: mergedAttendees })
      })
    }

    let updateResponse = await updateRequest(accessToken)

    if (updateResponse.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      updateResponse = await updateRequest(accessToken)
    }

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      let errorMessage = `Failed to add attendees: ${updateResponse.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to add attendees: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const updatedEvent = await updateResponse.json()

    return {
      success: true,
      output: {
        id: updatedEvent.id,
        attendeesAdded: newAttendees.map((a: any) => a.emailAddress.address),
        totalAttendees: mergedAttendees.length,
        invitationSent: sendInvitation !== false && sendInvitation !== 'false'
      }
    }
  } catch (error: any) {
    logger.error('[Outlook Calendar] Error adding attendees:', error)
    throw error
  }
}

/**
 * Get calendar events from Outlook
 */
export async function getOutlookCalendarEvents(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, input)
    const { calendarId, startDate, endDate, limit = 25 } = resolvedConfig

    let accessToken = await getDecryptedAccessToken(userId, "microsoft-outlook")

    // Build the endpoint
    let endpoint = calendarId && calendarId !== 'default'
      ? `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events`
      : 'https://graph.microsoft.com/v1.0/me/events'

    const params = new URLSearchParams()
    params.append('$top', Math.min(Math.max(1, parseInt(limit)), 100).toString())
    params.append('$orderby', 'start/dateTime')
    params.append('$select', 'id,subject,start,end,location,attendees,organizer,isOnlineMeeting,onlineMeeting,webLink,importance,sensitivity')

    // Add date filters if provided
    const filters: string[] = []
    if (startDate) {
      filters.push(`start/dateTime ge '${new Date(startDate).toISOString()}'`)
    }
    if (endDate) {
      filters.push(`end/dateTime le '${new Date(endDate).toISOString()}'`)
    }

    if (filters.length > 0) {
      params.append('$filter', filters.join(' and '))
    }

    const fullEndpoint = `${endpoint}?${params.toString()}`

    const makeRequest = async (token: string) => {
      return fetch(fullEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
    }

    let response = await makeRequest(accessToken)

    if (response.status === 401) {
      accessToken = await refreshMicrosoftToken(userId, "microsoft-outlook")
      response = await makeRequest(accessToken)
    }

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to fetch calendar events: ${response.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = `Failed to fetch calendar events: ${errorJson.error.message}`
        }
      } catch {}
      throw new Error(errorMessage)
    }

    const data = await response.json()
    const events = data.value || []

    return {
      success: true,
      output: {
        events: events.map((event: any) => ({
          id: event.id,
          subject: event.subject,
          start: event.start,
          end: event.end,
          location: event.location?.displayName,
          attendees: event.attendees?.map((a: any) => ({
            email: a.emailAddress?.address,
            name: a.emailAddress?.name,
            status: a.status?.response
          })),
          organizer: event.organizer?.emailAddress,
          isOnlineMeeting: event.isOnlineMeeting,
          onlineMeetingUrl: event.onlineMeeting?.joinUrl,
          webLink: event.webLink,
          importance: event.importance,
          sensitivity: event.sensitivity
        })),
        count: events.length
      }
    }
  } catch (error: any) {
    logger.error('[Outlook Calendar] Error fetching events:', error)
    throw error
  }
}
