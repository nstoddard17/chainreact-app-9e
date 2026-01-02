/**
 * Google Analytics Send Event Action
 * Sends custom events to Google Analytics 4 using the Measurement Protocol
 */

import { ExecutionContext } from '../../executeNode'
import { logger } from '@/lib/utils/logger'

export async function sendGoogleAnalyticsEvent(context: ExecutionContext): Promise<any> {
  const {
    measurementId,
    apiSecret,
    clientId,
    eventName,
    eventParams,
    userId
  } = context.config

  logger.debug('[Google Analytics] Preparing to send event:', {
    measurementId,
    eventName,
    hasClientId: !!clientId,
    hasUserId: !!userId,
    hasParams: !!eventParams
  })

  // Validate required fields
  if (!measurementId) {
    throw new Error('Measurement ID is required for sending events to Google Analytics')
  }

  if (!apiSecret) {
    throw new Error('API Secret is required. Create one in Google Analytics Admin > Data Streams > [Your Stream] > Measurement Protocol API secrets')
  }

  if (!clientId) {
    throw new Error('Client ID is required for sending events to Google Analytics')
  }

  if (!eventName) {
    throw new Error('Event name is required')
  }

  // Check test mode
  if (context.testMode) {
    logger.debug('[Google Analytics] Test mode - simulating event send')
    return {
      success: true,
      event_name: eventName,
      client_id: clientId,
      timestamp: new Date().toISOString(),
      testMode: true
    }
  }

  try {
    // Parse event parameters if it's a string
    let parsedParams = {}
    if (eventParams) {
      try {
        parsedParams = typeof eventParams === 'string' ? JSON.parse(eventParams) : eventParams
      } catch (error) {
        logger.warn('[Google Analytics] Failed to parse event parameters, using as-is:', eventParams)
        parsedParams = eventParams
      }
    }

    // Build the Measurement Protocol payload
    const payload = {
      client_id: clientId,
      events: [
        {
          name: eventName,
          params: parsedParams
        }
      ]
    }

    // Add user ID if provided
    if (userId) {
      payload['user_id'] = userId
    }

    // Use the provided API secret from configuration
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    // GA4 Measurement Protocol returns 204 on success (no content)
    if (response.status === 204 || response.status === 200) {
      logger.debug('[Google Analytics] Event sent successfully:', {
        eventName,
        clientId,
        status: response.status
      })

      return {
        success: true,
        event_name: eventName,
        client_id: clientId,
        user_id: userId || null,
        timestamp: new Date().toISOString()
      }
    } else {
      const errorText = await response.text()
      logger.error('[Google Analytics] Failed to send event:', {
        status: response.status,
        error: errorText
      })
      throw new Error(`Failed to send event to Google Analytics: ${response.status} - ${errorText}`)
    }
  } catch (error: any) {
    logger.error('[Google Analytics] Error sending event:', error)
    throw new Error(`Failed to send event to Google Analytics: ${error.message}`)
  }
}
