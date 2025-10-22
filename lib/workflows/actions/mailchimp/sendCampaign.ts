import { getMailchimpAuth } from './utils'
import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Send a Mailchimp email campaign
 */
export async function mailchimpSendCampaign(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const campaignId = context.dataFlowManager.resolveVariable(config.campaign_id)

    if (!campaignId) {
      throw new Error("Campaign is required")
    }


    logger.info('Sending Mailchimp campaign', {
      campaignId
    })

    const response = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/campaigns/${campaignId}/actions/send`,
      {
        method: 'POST',
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
        throw new Error(`Campaign not found: ${campaignId}`)
      }

      if (response.status === 400) {
        // Campaign might already be sent or have validation errors
        const details = errorData.errors?.map((e: any) => e.message).join(', ') || errorMessage
        throw new Error(`Cannot send campaign: ${details}`)
      }

      logger.error('Mailchimp API error', {
        status: response.status,
        error: errorMessage
      })
      throw new Error(`Mailchimp API error: ${errorMessage}`)
    }

    logger.info('Successfully sent Mailchimp campaign', {
      campaignId
    })

    return {
      success: true,
      output: {
        campaign_id: campaignId,
        status: 'sent',
        timestamp: new Date().toISOString()
      },
      message: `Successfully sent campaign: ${campaignId}`
    }
  } catch (error: any) {
    logger.error('Mailchimp Send Campaign error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to send campaign in Mailchimp'
    }
  }
}
