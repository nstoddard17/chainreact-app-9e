/**
 * Google Calendar Options Loader
 * Handles dynamic option loading for Google Calendar fields
 */

import { ProviderOptionsLoader, LoadOptionsParams, SelectOption } from '../types';

import { logger } from '@/lib/utils/logger'

export class GoogleCalendarOptionsLoader implements ProviderOptionsLoader {
  /**
   * Check if this loader can handle the field
   */
  canHandle(fieldName: string, providerId: string): boolean {
    if (providerId !== 'google-calendar') {
      return false;
    }

    // Fields this loader handles
    const handledFields = [
      'calendarId',
      'calendars',
      'sourceCalendarId',      // For move event action
      'destinationCalendarId', // For move event action
      'eventId',
      'events'
    ];

    return handledFields.includes(fieldName);
  }

  /**
   * Load options for the field
   */
  async loadOptions(params: LoadOptionsParams): Promise<SelectOption[]> {
    const { fieldName, resourceType, integrationId, dependsOnValue } = params;

    logger.debug('🗓️ [GoogleCalendar] Loading options:', {
      fieldName,
      resourceType,
      integrationId,
      dependsOnValue
    });

    if (!integrationId) {
      logger.warn('🗓️ [GoogleCalendar] No integration ID provided');
      return [];
    }

    try {
      // Determine data type based on field
      let dataType = 'google-calendars';
      const requestBody: any = {
        integrationId,
        dataType
      };

      // Add dependent value for event fields
      if (fieldName === 'eventId' || fieldName === 'events') {
        dataType = 'google-calendar-events';
        requestBody.dataType = dataType;
        if (dependsOnValue) {
          requestBody.options = { calendarId: dependsOnValue };
        }
      }

      const response = await fetch('/api/integrations/google/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        logger.error('🗓️ [GoogleCalendar] Failed to load options:', errorData);

        if (errorData.needsReconnection) {
          throw new Error('Google Calendar integration needs reconnection. Please reconnect your account.');
        }

        throw new Error(errorData.error || 'Failed to load Google Calendar data');
      }

      const result = await response.json();
      const items = result.data || [];

      // Format based on field type
      if (fieldName === 'calendarId' || fieldName === 'calendars' ||
          fieldName === 'sourceCalendarId' || fieldName === 'destinationCalendarId') {
        // Calendar selection (including source/destination for move event)
        return items.map((calendar: any) => ({
          value: calendar.value || calendar.id,
          label: calendar.name || calendar.summary,
          metadata: {
            primary: calendar.primary,
            timeZone: calendar.time_zone,
            backgroundColor: calendar.background_color
          }
        }));
      } else if (fieldName === 'eventId' || fieldName === 'events') {
        // Event selection
        return items.map((event: any) => ({
          value: event.value || event.id,
          label: event.label || event.summary || 'Untitled Event',
          description: event.description,
          metadata: {
            start: event.start,
            end: event.end,
            location: event.location,
            attendees: event.attendees
          }
        }));
      }

      return items;

    } catch (error: any) {
      logger.error('🗓️ [GoogleCalendar] Error loading options:', error);
      throw error;
    }
  }

  /**
   * Format value for display
   */
  formatValue(value: any, fieldName: string): string {
    if (!value) return '';

    if (typeof value === 'object' && value.label) {
      return value.label;
    }

    return String(value);
  }

  /**
   * Validate field value
   */
  validateValue(value: any, fieldName: string): boolean {
    if (!value) return false;

    // Calendar and event IDs should be non-empty strings
    if (fieldName === 'calendarId' || fieldName === 'calendars' ||
        fieldName === 'sourceCalendarId' || fieldName === 'destinationCalendarId' ||
        fieldName === 'eventId' || fieldName === 'events') {
      if (Array.isArray(value)) {
        return value.length > 0 && value.every(v => v && typeof v === 'string');
      }
      return typeof value === 'string' && value.length > 0;
    }

    return true;
  }

  /**
   * Get dependencies for a field
   */
  getDependencies(fieldName: string): string[] {
    // Event fields depend on calendar selection
    if (fieldName === 'eventId' || fieldName === 'events') {
      return ['calendarId'];
    }

    return [];
  }

  /**
   * Check if field should load on mount
   */
  shouldLoadOnMount(fieldName: string): boolean {
    // Calendar fields should load immediately (including source/destination for move event)
    return fieldName === 'calendarId' || fieldName === 'calendars' ||
           fieldName === 'sourceCalendarId' || fieldName === 'destinationCalendarId';
  }
}