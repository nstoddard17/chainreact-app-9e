/**
 * Google Analytics Conversion Events Handler
 */

import { GoogleAnalyticsIntegration, GoogleAnalyticsConversionEvent, GoogleAnalyticsDataHandler } from '../types'
import { createGoogleAnalyticsAdminClient } from '../utils'
import { logger } from '@/lib/utils/logger'

export const getGoogleAnalyticsConversionEvents: GoogleAnalyticsDataHandler<GoogleAnalyticsConversionEvent[]> = async (
  integration: GoogleAnalyticsIntegration,
  options?: { propertyId?: string }
): Promise<GoogleAnalyticsConversionEvent[]> => {
  try {
    if (!options?.propertyId) {
      throw new Error('Property ID is required to fetch conversion events')
    }

    const analyticsAdmin = await createGoogleAnalyticsAdminClient(integration)

    // List conversion events for the property
    const response = await analyticsAdmin.properties.conversionEvents.list({
      parent: `properties/${options.propertyId}`,
      pageSize: 300
    })

    const conversionEvents: GoogleAnalyticsConversionEvent[] = []

    if (response.data.conversionEvents) {
      for (const event of response.data.conversionEvents) {
        if (event.eventName && event.name) {
          // Extract event ID from name (format: properties/{property}/conversionEvents/{event})
          const eventId = event.name.split('/').pop() || event.eventName

          conversionEvents.push({
            id: eventId,
            name: event.name,
            eventName: event.eventName,
            counting_method: event.countingMethod || undefined,
            defaultValue: event.defaultConversionValue?.value || undefined
          })
        }
      }
    }

    logger.debug(`✅ [Google Analytics] Fetched ${conversionEvents.length} conversion events for property ${options.propertyId}`)
    return conversionEvents

  } catch (error: any) {
    logger.error('❌ [Google Analytics] Error fetching conversion events:', error)

    // Handle specific API errors
    if (error.code === 401) {
      throw new Error('Google Analytics authentication expired. Please reconnect your account.')
    } else if (error.code === 403) {
      throw new Error('Insufficient permissions to access Google Analytics conversion events.')
    } else if (error.code === 404) {
      throw new Error('Property not found. Please check the property ID.')
    }

    throw new Error(error.message || 'Error fetching Google Analytics conversion events')
  }
}
