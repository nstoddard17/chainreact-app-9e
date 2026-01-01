import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import { getMailchimpAuth } from './utils'
import crypto from 'crypto'

import { logger } from '@/lib/utils/logger'

/**
 * Unsubscribe a subscriber from a Mailchimp audience
 * This preserves the subscriber record (unlike remove which permanently deletes)
 */
export async function mailchimpUnsubscribeSubscriber(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Get Mailchimp auth with proper data center
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const audienceId = context.dataFlowManager.resolveVariable(config.audience_id)
    const email = context.dataFlowManager.resolveVariable(config.email)
    const sendGoodbye = context.dataFlowManager.resolveVariable(config.sendGoodbye) === true
    const sendNotification = context.dataFlowManager.resolveVariable(config.sendNotification) === true
    const reason = context.dataFlowManager.resolveVariable(config.reason)

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

    logger.info('Unsubscribing subscriber in Mailchimp', {
      audienceId,
      subscriberHash,
      sendGoodbye,
      sendNotification
    })

    // Update the subscriber status to unsubscribed
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'unsubscribed'
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.detail || errorData.title || `HTTP ${response.status}`

      if (response.status === 404) {
        return {
          success: false,
          output: {
            email: email,
            found: false
          },
          message: `Subscriber ${email} not found in this audience`
        }
      }

      logger.error('Mailchimp API error unsubscribing subscriber', {
        status: response.status,
        error: errorMessage,
        errorData
      })
      throw new Error(`Mailchimp API error: ${errorMessage}`)
    }

    const data = await response.json()

    // If sendGoodbye or sendNotification are enabled, we'd need to handle those separately
    // Mailchimp doesn't directly support these via the API - they are typically list settings
    // Log if these were requested
    if (sendGoodbye || sendNotification) {
      logger.info('Note: Goodbye/notification emails are controlled by list settings, not API', {
        sendGoodbye,
        sendNotification
      })
    }

    // If there's a reason provided, we can add it as a note
    if (reason) {
      const noteUrl = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}/notes`
      await fetch(noteUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          note: `Unsubscribe reason: ${reason}`
        })
      }).catch(err => {
        // Don't fail the whole operation if note fails
        logger.warn('Failed to add unsubscribe reason note', { error: err.message })
      })
    }

    logger.info('Successfully unsubscribed subscriber from Mailchimp', {
      subscriberId: data.id,
      newStatus: data.status
    })

    return {
      success: true,
      output: {
        email: data.email_address,
        status: data.status,
        unsubscribeTime: data.last_changed || new Date().toISOString(),
        success: true
      },
      message: `Successfully unsubscribed ${email}`
    }
  } catch (error: any) {
    logger.error('Mailchimp Unsubscribe Subscriber error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to unsubscribe subscriber'
    }
  }
}
