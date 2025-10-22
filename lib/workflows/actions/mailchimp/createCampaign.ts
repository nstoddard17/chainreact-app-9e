import { getMailchimpAuth } from './utils'
import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'

import { logger } from '@/lib/utils/logger'

/**
 * Create a new Mailchimp email campaign
 */
export async function mailchimpCreateCampaign(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const audienceId = context.dataFlowManager.resolveVariable(config.audience_id)
    const type = context.dataFlowManager.resolveVariable(config.type) || 'regular'
    const subjectLine = context.dataFlowManager.resolveVariable(config.subject_line)
    const previewText = context.dataFlowManager.resolveVariable(config.preview_text) || ''
    const fromName = context.dataFlowManager.resolveVariable(config.from_name)
    const replyTo = context.dataFlowManager.resolveVariable(config.reply_to)
    const htmlContent = context.dataFlowManager.resolveVariable(config.html_content) || ''
    const textContent = context.dataFlowManager.resolveVariable(config.text_content) || ''

    if (!audienceId) {
      throw new Error("Audience is required")
    }

    if (!subjectLine) {
      throw new Error("Subject line is required")
    }

    if (!fromName) {
      throw new Error("From name is required")
    }

    if (!replyTo) {
      throw new Error("Reply-to email is required")
    }

    if (!htmlContent && !textContent) {
      throw new Error("Either HTML content or text content is required")
    }


    logger.info('Creating Mailchimp campaign', {
      audienceId,
      type
    })

    // Step 1: Create the campaign
    const createResponse = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/campaigns`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: type,
          recipients: {
            list_id: audienceId
          },
          settings: {
            subject_line: subjectLine,
            preview_text: previewText,
            from_name: fromName,
            reply_to: replyTo
          }
        })
      }
    )

    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => ({}))
      const errorMessage = errorData.detail || errorData.title || `HTTP ${createResponse.status}`

      logger.error('Mailchimp API error (create campaign)', {
        status: createResponse.status,
        error: errorMessage
      })
      throw new Error(`Mailchimp API error: ${errorMessage}`)
    }

    const campaign = await createResponse.json()
    const campaignId = campaign.id

    // Step 2: Set the campaign content
    const contentResponse = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/campaigns/${campaignId}/content`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          html: htmlContent || undefined,
          plain_text: textContent || undefined
        })
      }
    )

    if (!contentResponse.ok) {
      const errorData = await contentResponse.json().catch(() => ({}))
      const errorMessage = errorData.detail || errorData.title || `HTTP ${contentResponse.status}`

      logger.error('Mailchimp API error (set content)', {
        status: contentResponse.status,
        error: errorMessage
      })

      // Clean up the created campaign if content setting failed
      await fetch(
        `https://${dc}.api.mailchimp.com/3.0/campaigns/${campaignId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      ).catch(() => {}) // Ignore cleanup errors

      throw new Error(`Failed to set campaign content: ${errorMessage}`)
    }

    logger.info('Successfully created Mailchimp campaign', {
      campaignId,
      status: campaign.status
    })

    return {
      success: true,
      output: {
        campaign_id: campaignId,
        web_id: campaign.web_id,
        status: campaign.status,
        archive_url: campaign.archive_url,
        long_archive_url: campaign.long_archive_url,
        timestamp: new Date().toISOString()
      },
      message: `Successfully created campaign: ${subjectLine}`
    }
  } catch (error: any) {
    logger.error('Mailchimp Create Campaign error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create campaign in Mailchimp'
    }
  }
}
