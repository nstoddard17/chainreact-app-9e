import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Finds a conversion event by name in a Google Analytics 4 property
 */
export async function findGoogleAnalyticsConversion(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'google-analytics')

    // Get configuration values
    const propertyId = resolveValue(config.propertyId, input)
    const conversionEventName = resolveValue(config.conversionEventName, input)

    if (!propertyId || !conversionEventName) {
      return {
        success: false,
        message: 'Property ID and Conversion Event Name are required',
      }
    }

    logger.debug(`[GA4 Find Conversion] Searching for conversion "${conversionEventName}" in property ${propertyId}`)

    // List all conversion events for the property
    const response = await fetch(
      `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/conversionEvents`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
      throw new Error(error.error?.message || `Failed to list conversion events: ${response.status}`)
    }

    const result = await response.json()
    const conversionEvents = result.conversionEvents || []

    // Find the conversion event by name
    const foundEvent = conversionEvents.find(
      (event: any) => event.eventName === conversionEventName
    )

    if (!foundEvent) {
      logger.debug(`[GA4 Find Conversion] Conversion event "${conversionEventName}" not found`)
      return {
        success: true,
        output: {
          ...input,
          found: false,
          event_name: conversionEventName,
        },
        message: `Conversion event "${conversionEventName}" not found`,
      }
    }

    logger.debug('[GA4 Find Conversion] Found conversion event:', foundEvent.name)

    // Extract the conversion ID from the resource name
    // Format: properties/{propertyId}/conversionEvents/{conversionId}
    const conversionId = foundEvent.name?.split('/').pop() || ''

    return {
      success: true,
      output: {
        ...input,
        found: true,
        event_name: foundEvent.eventName,
        counting_method: foundEvent.countingMethod,
        id: conversionId,
        resource_name: foundEvent.name,
      },
      message: `Found conversion event "${conversionEventName}"`,
    }
  } catch (error: any) {
    logger.error('[GA4 Find Conversion] Error:', error)
    return {
      success: false,
      message: `Failed to find conversion: ${error.message}`,
      error: error.message,
    }
  }
}
