import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import { getMailchimpAuth } from './utils'
import crypto from 'crypto'
import { logger } from '@/lib/utils/logger'

/**
 * Create a custom event for a Mailchimp subscriber
 */
export async function mailchimpCreateEvent(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Get Mailchimp auth with proper data center
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const audienceId = context.dataFlowManager.resolveVariable(config.audience_id)
    const email = context.dataFlowManager.resolveVariable(config.email)
    const eventName = context.dataFlowManager.resolveVariable(config.event_name)
    const propertiesInput = context.dataFlowManager.resolveVariable(config.properties)
    const occurredAt = context.dataFlowManager.resolveVariable(config.occurred_at)
    const isSyncing = context.dataFlowManager.resolveVariable(config.is_syncing) || false

    // Validate required fields
    if (!audienceId) throw new Error("Audience is required")
    if (!email) throw new Error("Subscriber email is required")
    if (!eventName) throw new Error("Event name is required")

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      throw new Error("Invalid email address format")
    }

    // Parse properties if provided (supports both object and JSON string formats)
    let properties: Record<string, string> = {}
    if (propertiesInput) {
      let rawProperties: Record<string, any> = {}

      if (typeof propertiesInput === 'string') {
        try {
          rawProperties = JSON.parse(propertiesInput)
        } catch (e) {
          throw new Error("Event properties must be valid JSON format")
        }
      } else if (typeof propertiesInput === 'object' && !Array.isArray(propertiesInput)) {
        rawProperties = propertiesInput
      } else {
        throw new Error("Event properties must be an object with key-value pairs")
      }

      // Mailchimp requires all property values to be strings
      for (const [key, value] of Object.entries(rawProperties)) {
        properties[key] = typeof value === 'object' ? JSON.stringify(value) : String(value)
      }
    }

    // Build request body
    const requestBody: any = {
      name: eventName,
      properties: properties
    }

    // Add optional fields
    if (occurredAt) {
      requestBody.occurred_at = occurredAt
    }
    if (isSyncing) {
      requestBody.is_syncing = true
    }

    logger.info('Creating Mailchimp event', {
      audienceId,
      eventName,
      hasProperties: Object.keys(properties).length > 0
    })

    // The subscriber hash is the MD5 hash of the lowercase email
    const subscriberHash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex')

    const url = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}/events`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      let errorMessage = errorData.detail || errorData.title || `HTTP ${response.status}`

      // Provide clearer error message for 404 (subscriber not found)
      if (response.status === 404) {
        errorMessage = `Subscriber "${email}" not found in this audience. The subscriber must exist before you can create events for them.`
      }

      // Include field-specific validation errors if present
      if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
        const fieldErrors = errorData.errors.map((e: any) => `${e.field}: ${e.message}`).join('; ')
        errorMessage = `${errorMessage} - ${fieldErrors}`
      }

      logger.error('Mailchimp API error', {
        status: response.status,
        error: errorMessage,
        errorData
      })
      throw new Error(`Mailchimp API error: ${errorMessage}`)
    }

    // Event creation returns 204 No Content on success
    logger.info('Successfully created Mailchimp event', {
      eventName,
      subscriberEmail: email
    })

    return {
      success: true,
      output: {
        success: true,
        eventName,
        subscriberEmail: email
      },
      message: `Successfully created event "${eventName}" for ${email}`
    }
  } catch (error: any) {
    logger.error('Mailchimp Create Event error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create Mailchimp event'
    }
  }
}
