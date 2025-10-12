/**
 * Mailchimp Campaigns Handler
 */

import { MailchimpIntegration, MailchimpCampaign, MailchimpDataHandler } from '../types'
import {
  validateMailchimpIntegration,
  validateMailchimpToken,
  makeMailchimpApiRequest,
  parseMailchimpApiResponse,
  buildMailchimpApiUrl
} from '../utils'

import { logger } from '@/lib/utils/logger'

export const getMailchimpCampaigns: MailchimpDataHandler<MailchimpCampaign> = async (
  integration: MailchimpIntegration,
  options: any = {}
): Promise<MailchimpCampaign[]> => {
  logger.debug("🔍 [Mailchimp] Fetching campaigns for integration:", {
    id: integration.id,
    hasToken: !!integration.access_token
  })

  try {
    // Validate integration status
    validateMailchimpIntegration(integration)

    logger.debug(`🔍 [Mailchimp] Validating token...`)
    const tokenResult = await validateMailchimpToken(integration)

    if (!tokenResult.success) {
      logger.debug(`❌ [Mailchimp] Token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }

    logger.debug('🔍 [Mailchimp] Fetching campaigns from API...')
    const apiUrl = await buildMailchimpApiUrl(integration, '/campaigns')

    // Add query parameters - get only unsent campaigns or draft campaigns
    const url = new URL(apiUrl)
    url.searchParams.set('count', '1000')
    url.searchParams.set('status', 'save') // Only get draft/saved campaigns
    url.searchParams.set('fields', 'campaigns.id,campaigns.web_id,campaigns.type,campaigns.create_time,campaigns.status,campaigns.settings,campaigns.recipients')
    url.searchParams.set('sort_field', 'create_time')
    url.searchParams.set('sort_dir', 'DESC')

    const response = await makeMailchimpApiRequest(url.toString(), tokenResult.token!)

    const campaigns = await parseMailchimpApiResponse<MailchimpCampaign>(response)

    logger.debug(`✅ [Mailchimp] Campaigns fetched successfully: ${campaigns.length} campaigns`)
    return campaigns

  } catch (error: any) {
    logger.error("❌ [Mailchimp] Error fetching campaigns:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Mailchimp authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Mailchimp API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching Mailchimp campaigns")
  }
}
