import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import { getMailchimpAuth } from './utils'

import { logger } from '@/lib/utils/logger'

/**
 * Get detailed information about a specific campaign from Mailchimp
 */
export async function mailchimpGetCampaign(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Get Mailchimp auth with proper data center
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const campaignId = context.dataFlowManager.resolveVariable(config.campaign_id)

    if (!campaignId) {
      throw new Error("Campaign is required")
    }

    const url = `https://${dc}.api.mailchimp.com/3.0/campaigns/${campaignId}`

    logger.info('Getting campaign from Mailchimp', {
      campaignId
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

      if (response.status === 404) {
        return {
          success: false,
          output: {
            found: false,
            campaignId: campaignId
          },
          message: `Campaign ${campaignId} not found`
        }
      }

      logger.error('Mailchimp API error getting campaign', {
        status: response.status,
        error: errorMessage,
        errorData
      })
      throw new Error(`Mailchimp API error: ${errorMessage}`)
    }

    const data = await response.json()

    logger.info('Successfully retrieved campaign from Mailchimp', {
      campaignId: data.id,
      status: data.status
    })

    return {
      success: true,
      output: {
        id: data.id,
        type: data.type,
        status: data.status,
        subjectLine: data.settings?.subject_line || '',
        previewText: data.settings?.preview_text || '',
        fromName: data.settings?.from_name || '',
        replyTo: data.settings?.reply_to || '',
        audienceId: data.recipients?.list_id || '',
        recipientCount: data.recipients?.recipient_count || 0,
        createTime: data.create_time,
        sendTime: data.send_time,
        webId: data.web_id,
        archiveUrl: data.archive_url || '',
        found: true
      },
      message: `Successfully retrieved campaign ${campaignId}`
    }
  } catch (error: any) {
    logger.error('Mailchimp Get Campaign error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to get campaign from Mailchimp'
    }
  }
}
