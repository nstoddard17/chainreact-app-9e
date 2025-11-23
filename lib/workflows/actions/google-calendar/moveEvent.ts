import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { google } from 'googleapis'

import { logger } from '@/lib/utils/logger'

/**
 * Check if an event ID is a recurring instance (contains underscore with date)
 * Recurring instance IDs look like: baseEventId_20231115T100000Z
 */
function isRecurringInstance(eventId: string): boolean {
  // Recurring instances have format: baseId_YYYYMMDDTHHMMSSZ
  return /_\d{8}T\d{6}Z$/.test(eventId)
}

/**
 * Extract the base recurring event ID from an instance ID
 */
function getBaseEventId(eventId: string): string {
  const match = eventId.match(/^(.+)_\d{8}T\d{6}Z$/)
  return match ? match[1] : eventId
}

/**
 * Google Calendar move event handler
 * Moves an event from one calendar to another
 *
 * Supports three modes for recurring event instances:
 * - move_series: Move the entire recurring series
 * - copy_instance: Copy the instance to new calendar (delete original + create copy)
 * - skip: Skip recurring instances and continue workflow
 */
export async function moveGoogleCalendarEvent(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve config values if they contain template variables
    const needsResolution = typeof config === 'object' &&
      Object.values(config).some(v =>
        typeof v === 'string' && v.includes('{{') && v.includes('}}')
      )

    const resolvedConfig = needsResolution ? resolveValue(config, input) : config

    const {
      sourceCalendarId = 'primary',
      destinationCalendarId,
      eventId,
      recurringEventHandling = 'move_series',
      sendNotifications = 'all'
    } = resolvedConfig

    if (!eventId) {
      throw new Error('Event ID is required to move an event')
    }

    // Check if an array was provided instead of a single event ID
    if (Array.isArray(eventId)) {
      throw new Error(
        'Multiple events detected. To move multiple events, add a Loop node before this action and use {{loop.currentItem.eventId}} as the Event ID. If you want to move only the first event, use {{list_events_node.events.0.eventId}} instead.'
      )
    }

    if (!destinationCalendarId) {
      throw new Error('Destination calendar ID is required')
    }

    if (sourceCalendarId === destinationCalendarId) {
      throw new Error('Source and destination calendars must be different')
    }

    // Get the decrypted access token for Google
    const accessToken = await getDecryptedAccessToken(userId, "google-calendar")

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })

    // Create calendar API client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Determine send notifications parameter
    let sendUpdates: 'all' | 'externalOnly' | 'none' = 'none'
    if (sendNotifications === 'all') {
      sendUpdates = 'all'
    } else if (sendNotifications === 'externalOnly') {
      sendUpdates = 'externalOnly'
    }

    // Check if this is a recurring instance
    const isInstance = isRecurringInstance(eventId)

    if (isInstance) {
      logger.info('🔄 [Google Calendar] Detected recurring event instance', {
        eventId,
        handling: recurringEventHandling
      })

      switch (recurringEventHandling) {
        case 'move_series': {
          // Move the entire recurring series instead
          const baseEventId = getBaseEventId(eventId)
          logger.info('🔄 [Google Calendar] Moving entire series', { baseEventId })

          const response = await calendar.events.move({
            calendarId: sourceCalendarId,
            eventId: baseEventId,
            destination: destinationCalendarId,
            sendUpdates: sendUpdates
          })

          const movedEvent = response.data

          logger.info('✅ [Google Calendar] Moved entire recurring series', {
            eventId: baseEventId,
            from: sourceCalendarId,
            to: destinationCalendarId,
            title: movedEvent.summary
          })

          return {
            success: true,
            output: {
              eventId: movedEvent.id,
              htmlLink: movedEvent.htmlLink,
              summary: movedEvent.summary,
              description: movedEvent.description,
              location: movedEvent.location,
              start: movedEvent.start,
              end: movedEvent.end,
              sourceCalendarId: sourceCalendarId,
              destinationCalendarId: destinationCalendarId,
              movedAt: new Date().toISOString(),
              status: movedEvent.status,
              action: 'moved_series',
              originalInstanceId: eventId,
              movedSeriesId: baseEventId
            }
          }
        }

        case 'copy_instance': {
          // Get the original event details
          const originalEvent = await calendar.events.get({
            calendarId: sourceCalendarId,
            eventId: eventId
          })

          const eventData = originalEvent.data

          // Create a copy on the destination calendar
          const newEvent = await calendar.events.insert({
            calendarId: destinationCalendarId,
            sendUpdates: sendUpdates,
            requestBody: {
              summary: eventData.summary,
              description: eventData.description,
              location: eventData.location,
              start: eventData.start,
              end: eventData.end,
              attendees: eventData.attendees,
              colorId: eventData.colorId,
              transparency: eventData.transparency,
              visibility: eventData.visibility,
              reminders: eventData.reminders,
              // Note: We don't copy recurrence since this is a single instance copy
            }
          })

          // Delete the original instance (creates an exception in the recurring series)
          await calendar.events.delete({
            calendarId: sourceCalendarId,
            eventId: eventId,
            sendUpdates: sendUpdates
          })

          logger.info('✅ [Google Calendar] Copied recurring instance to new calendar', {
            originalEventId: eventId,
            newEventId: newEvent.data.id,
            from: sourceCalendarId,
            to: destinationCalendarId,
            title: newEvent.data.summary
          })

          return {
            success: true,
            output: {
              eventId: newEvent.data.id,
              htmlLink: newEvent.data.htmlLink,
              summary: newEvent.data.summary,
              description: newEvent.data.description,
              location: newEvent.data.location,
              start: newEvent.data.start,
              end: newEvent.data.end,
              sourceCalendarId: sourceCalendarId,
              destinationCalendarId: destinationCalendarId,
              movedAt: new Date().toISOString(),
              status: newEvent.data.status,
              action: 'copied_instance',
              originalInstanceId: eventId,
              originalDeleted: true
            }
          }
        }

        case 'skip': {
          // Skip this recurring instance
          logger.info('⏭️ [Google Calendar] Skipping recurring event instance', {
            eventId,
            from: sourceCalendarId,
            to: destinationCalendarId
          })

          // Get event details for the output
          const skippedEvent = await calendar.events.get({
            calendarId: sourceCalendarId,
            eventId: eventId
          })

          return {
            success: true,
            output: {
              eventId: eventId,
              htmlLink: skippedEvent.data.htmlLink,
              summary: skippedEvent.data.summary,
              description: skippedEvent.data.description,
              location: skippedEvent.data.location,
              start: skippedEvent.data.start,
              end: skippedEvent.data.end,
              sourceCalendarId: sourceCalendarId,
              destinationCalendarId: destinationCalendarId,
              movedAt: null,
              status: 'skipped',
              action: 'skipped',
              skipped: true,
              skipReason: 'Event is a recurring instance. Configure "recurringEventHandling" to move the series or copy the instance.'
            }
          }
        }

        default:
          throw new Error(`Unknown recurringEventHandling mode: ${recurringEventHandling}`)
      }
    }

    // Standard move for non-recurring events
    const response = await calendar.events.move({
      calendarId: sourceCalendarId,
      eventId: eventId,
      destination: destinationCalendarId,
      sendUpdates: sendUpdates
    })

    const movedEvent = response.data

    logger.info('✅ [Google Calendar] Moved event', {
      eventId: eventId,
      from: sourceCalendarId,
      to: destinationCalendarId,
      title: movedEvent.summary
    })

    return {
      success: true,
      output: {
        eventId: movedEvent.id,
        htmlLink: movedEvent.htmlLink,
        summary: movedEvent.summary,
        description: movedEvent.description,
        location: movedEvent.location,
        start: movedEvent.start,
        end: movedEvent.end,
        sourceCalendarId: sourceCalendarId,
        destinationCalendarId: destinationCalendarId,
        movedAt: new Date().toISOString(),
        status: movedEvent.status,
        action: 'moved'
      }
    }
  } catch (error: any) {
    logger.error('❌ [Google Calendar] Error moving event:', error)

    const errorMessage = error.message || error.errors?.[0]?.message || ''

    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || error.code === 401) {
      throw new Error('Google Calendar authentication failed. Please reconnect your account.')
    }

    if (errorMessage.includes('404') || error.code === 404) {
      throw new Error('Event or calendar not found.')
    }

    // Handle recurring event instance error (fallback if our detection missed it)
    if (errorMessage.includes('Cannot change the organizer of an instance') ||
        errorMessage.includes('organizer of an instance')) {
      throw new Error(
        'Cannot move this event because it is a single instance of a recurring event. ' +
        'Change the "If event is a recurring instance" setting to either "Move entire series" or "Copy instance to new calendar".'
      )
    }

    // Handle permission errors
    if (errorMessage.includes('forbidden') || errorMessage.includes('403') || error.code === 403) {
      throw new Error(
        'Permission denied. You may not have permission to move events from this calendar, ' +
        'or the event may be owned by someone else.'
      )
    }

    throw error
  }
}
