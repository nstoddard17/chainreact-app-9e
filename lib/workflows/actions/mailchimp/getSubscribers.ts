import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Get subscribers from a Mailchimp audience
 */
export async function mailchimpGetSubscribers(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "mailchimp")

    // Resolve dynamic values
    const audienceId = context.dataFlowManager.resolveVariable(config.audience_id)
    const status = context.dataFlowManager.resolveVariable(config.status) || 'subscribed'
    const limit = context.dataFlowManager.resolveVariable(config.limit) || 100
    const offset = context.dataFlowManager.resolveVariable(config.offset) || 0

    if (!audienceId) {
      throw new Error("Audience is required")
    }

    // Get the data center from the access token
    const dc = accessToken.split('-').pop()

    // Build query params
    const params = new URLSearchParams({
      status,
      count: Math.min(limit, 1000).toString(),
      offset: offset.toString()
    })

    const response = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members?${params}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Mailchimp API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const subscribers = data.members || []

    return {
      success: true,
      output: {
        subscribers,
        count: subscribers.length,
        totalItems: data.total_items || 0
      },
      message: `Successfully retrieved ${subscribers.length} subscribers from audience`
    }
  } catch (error: any) {
    logger.error('Mailchimp Get Subscribers error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to retrieve subscribers from Mailchimp'
    }
  }
}
