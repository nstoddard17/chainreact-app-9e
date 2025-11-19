import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Creates a new conversion event for a Google Analytics 4 property
 */
export async function createGoogleAnalyticsConversionEvent(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'google-analytics')

    // Get configuration values
    const propertyId = resolveValue(config.propertyId, input)
    const eventName = resolveValue(config.eventName, input)
    const countingMethod = resolveValue(config.countingMethod, input) || 'ONCE_PER_EVENT'
    const customEvent = resolveValue(config.customEvent, input) || false

    if (!propertyId || !eventName) {
      return {
        success: false,
        message: 'Property ID and Event Name are required',
      }
    }

    logger.debug(`[GA4 Create Conversion Event] Creating conversion for event "${eventName}" in property ${propertyId}`)

    // Create the conversion event
    const response = await fetch(
      `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/conversionEvents`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventName: eventName,
          countingMethod: countingMethod,
          custom: customEvent,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }))

      // Check if conversion already exists
      if (response.status === 409 || error.error?.message?.includes('already exists')) {
        return {
          success: false,
          message: `Conversion event "${eventName}" already exists`,
          error: 'Conversion event already exists',
        }
      }

      throw new Error(error.error?.message || `Failed to create conversion event: ${response.status}`)
    }

    const result = await response.json()

    logger.debug('[GA4 Create Conversion Event] Successfully created conversion event:', result.name)

    return {
      success: true,
      output: {
        ...input,
        success: true,
        event_name: result.eventName,
        counting_method: result.countingMethod,
        property_id: propertyId,
        created_time: new Date().toISOString(),
      },
      message: `Conversion event "${eventName}" created successfully`,
    }
  } catch (error: any) {
    logger.error('[GA4 Create Conversion Event] Error:', error)
    return {
      success: false,
      message: `Failed to create conversion event: ${error.message}`,
      error: error.message,
    }
  }
}
