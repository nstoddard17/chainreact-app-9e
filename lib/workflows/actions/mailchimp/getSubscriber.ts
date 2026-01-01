import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import { getMailchimpAuth } from './utils'
import crypto from 'crypto'

import { logger } from '@/lib/utils/logger'

/**
 * Get detailed information about a specific subscriber from Mailchimp
 */
export async function mailchimpGetSubscriber(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Get Mailchimp auth with proper data center
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const audienceId = context.dataFlowManager.resolveVariable(config.audience_id)
    const email = context.dataFlowManager.resolveVariable(config.email)

    if (!audienceId) {
      throw new Error("Audience is required")
    }

    if (!email) {
      throw new Error("Email address is required")
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      throw new Error("Invalid email address format")
    }

    // The subscriber hash is the MD5 hash of the lowercase email
    const subscriberHash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex')

    const url = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}`

    logger.info('Getting subscriber from Mailchimp', {
      audienceId,
      subscriberHash
    })

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.detail || errorData.title || `HTTP ${response.status}`

      // Handle 404 (subscriber not found) gracefully
      if (response.status === 404) {
        return {
          success: false,
          output: {
            found: false,
            email: email
          },
          message: `Subscriber ${email} not found in this audience`
        }
      }

      logger.error('Mailchimp API error getting subscriber', {
        status: response.status,
        error: errorMessage,
        errorData
      })
      throw new Error(`Mailchimp API error: ${errorMessage}`)
    }

    const data = await response.json()

    logger.info('Successfully retrieved subscriber from Mailchimp', {
      subscriberId: data.id,
      status: data.status
    })

    return {
      success: true,
      output: {
        email: data.email_address,
        status: data.status,
        firstName: data.merge_fields?.FNAME || '',
        lastName: data.merge_fields?.LNAME || '',
        phone: data.merge_fields?.PHONE || '',
        address: data.merge_fields?.ADDRESS || null,
        tags: data.tags?.map((t: any) => t.name) || [],
        dateSubscribed: data.timestamp_signup,
        lastChanged: data.last_changed,
        emailClient: data.email_client || '',
        location: data.location || null,
        vip: data.vip || false,
        subscriberId: data.id,
        webId: data.web_id,
        found: true
      },
      message: `Successfully retrieved subscriber ${email}`
    }
  } catch (error: any) {
    logger.error('Mailchimp Get Subscriber error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to get subscriber from Mailchimp'
    }
  }
}
