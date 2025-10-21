import { getMailchimpAuth } from './utils'
import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import crypto from 'crypto'

import { logger } from '@/lib/utils/logger'

/**
 * Remove a subscriber from a Mailchimp audience
 */
export async function mailchimpRemoveSubscriber(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const audienceId = context.dataFlowManager.resolveVariable(config.audience_id)
    const email = context.dataFlowManager.resolveVariable(config.email)
    const deletePermanently = context.dataFlowManager.resolveVariable(config.delete_permanently) || false

    if (!audienceId) {
      throw new Error("Audience is required")
    }

    if (!email) {
      throw new Error("Email address is required")
    }


    // The subscriber hash is the MD5 hash of the lowercase email
    const subscriberHash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex')

    logger.info('Removing subscriber from Mailchimp', {
      audienceId,
      deletePermanently
    })

    if (deletePermanently) {
      // Permanently delete the subscriber
      const response = await fetch(
        `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.detail || errorData.title || `HTTP ${response.status}`

        if (response.status === 404) {
          throw new Error(`Subscriber not found: ${email}`)
        }

        logger.error('Mailchimp API error', {
          status: response.status,
          error: errorMessage
        })
        throw new Error(`Mailchimp API error: ${errorMessage}`)
      }

      logger.info('Successfully deleted subscriber from Mailchimp')

      return {
        success: true,
        output: {
          email,
          action: 'permanently_deleted',
          timestamp: new Date().toISOString()
        },
        message: `Successfully permanently deleted ${email} from audience`
      }
    } else {
      // Just unsubscribe them (change status to unsubscribed)
      const response = await fetch(
        `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'unsubscribed'
          })
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.detail || errorData.title || `HTTP ${response.status}`

        if (response.status === 404) {
          throw new Error(`Subscriber not found: ${email}`)
        }

        logger.error('Mailchimp API error', {
          status: response.status,
          error: errorMessage
        })
        throw new Error(`Mailchimp API error: ${errorMessage}`)
      }

      const data = await response.json()

      logger.info('Successfully unsubscribed subscriber from Mailchimp', {
        subscriberId: data.id
      })

      return {
        success: true,
        output: {
          subscriber_id: data.id,
          email: data.email_address,
          status: data.status,
          action: 'unsubscribed',
          timestamp: new Date().toISOString()
        },
        message: `Successfully unsubscribed ${email} from audience`
      }
    }
  } catch (error: any) {
    logger.error('Mailchimp Remove Subscriber error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to remove subscriber from Mailchimp'
    }
  }
}
