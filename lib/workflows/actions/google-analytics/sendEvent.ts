/**
 * Google Analytics Send Event Action
 * Sends custom events to Google Analytics 4 using the Measurement Protocol
 */

import { ExecutionContext } from '../../executeNode'
import { logger } from '@/lib/utils/logger'
import { getPropertyAndStreamIds, getOrCreateApiSecret } from './secretManager'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

export async function sendGoogleAnalyticsEvent(context: ExecutionContext): Promise<any> {
  const {
    measurementId,
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

  // Get the Google Analytics integration
  const integration = await context.getIntegration('google-analytics')
  if (!integration) {
    throw new Error('Google Analytics integration not found. Please connect your Google Analytics account.')
  }

  if (!integration.access_token) {
    throw new Error('Google Analytics access token not found. Please reconnect your account.')
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

    // Get or create Measurement Protocol API secret automatically
    // This eliminates the need for users to manually create API secrets
    logger.debug('[Google Analytics] Looking up property and data stream for measurement ID')

    const { propertyId, dataStreamId } = await getPropertyAndStreamIds(integration, measurementId)

    logger.debug('[Google Analytics] Getting or creating API secret')

    const apiSecret = await getOrCreateApiSecret(
      integration,
      propertyId,
      dataStreamId,
      supabase
    )

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
