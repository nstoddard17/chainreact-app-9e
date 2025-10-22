import { getMailchimpAuth } from './utils'
import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import crypto from 'crypto'

import { logger } from '@/lib/utils/logger'

/**
 * Add tags to a subscriber in a Mailchimp audience
 */
export async function mailchimpAddTag(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const audienceId = context.dataFlowManager.resolveVariable(config.audience_id)
    const email = context.dataFlowManager.resolveVariable(config.email)
    const tags = context.dataFlowManager.resolveVariable(config.tags) || []

    if (!audienceId) {
      throw new Error("Audience is required")
    }

    if (!email) {
      throw new Error("Email address is required")
    }

    if (!tags || tags.length === 0) {
      throw new Error("At least one tag is required")
    }


    // The subscriber hash is the MD5 hash of the lowercase email
    const subscriberHash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex')

    // Build tags array with status 'active'
    const tagsToAdd = tags.map((tag: string) => ({
      name: tag,
      status: 'active'
    }))

    logger.info('Adding tags to subscriber in Mailchimp', {
      audienceId,
      tagCount: tags.length
    })

    const response = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}/tags`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tags: tagsToAdd
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

    logger.info('Successfully added tags to subscriber in Mailchimp', {
      tagCount: tags.length
    })

    return {
      success: true,
      output: {
        email,
        tags_added: tags,
        count: tags.length,
        timestamp: new Date().toISOString()
      },
      message: `Successfully added ${tags.length} tag(s) to ${email}`
    }
  } catch (error: any) {
    logger.error('Mailchimp Add Tag error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to add tags to subscriber in Mailchimp'
    }
  }
}
