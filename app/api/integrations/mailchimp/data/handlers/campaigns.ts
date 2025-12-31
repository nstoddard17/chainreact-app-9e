/**
 * Mailchimp Campaigns Handler
 */

import { MailchimpIntegration, MailchimpDataHandler } from '../types'
import {
  validateMailchimpIntegration,
  validateMailchimpToken,
  makeMailchimpApiRequest,
  buildMailchimpApiUrl
} from '../utils'

import { logger } from '@/lib/utils/logger'

// Return type for dropdown options
interface CampaignOption {
  value: string
  label: string
}

export const getMailchimpCampaigns: MailchimpDataHandler<CampaignOption> = async (
  integration: MailchimpIntegration,
  options: any = {}
): Promise<CampaignOption[]> => {
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

    // Add query parameters - get campaigns for selection
    const url = new URL(apiUrl)
    url.searchParams.set('count', '1000')
    // Don't filter by status so we can see all campaigns
    url.searchParams.set('fields', 'campaigns.id,campaigns.web_id,campaigns.type,campaigns.create_time,campaigns.status,campaigns.settings,campaigns.recipients')
    url.searchParams.set('sort_field', 'create_time')
    url.searchParams.set('sort_dir', 'DESC')

    const response = await makeMailchimpApiRequest(url.toString(), tokenResult.token!)
    const data = await response.json()

    const campaigns = data.campaigns || []

    // Format campaigns for dropdown with value and label
    const formattedCampaigns: CampaignOption[] = campaigns.map((campaign: any) => {
      const title = campaign.settings?.title || campaign.settings?.subject_line || 'Untitled Campaign'
      const status = campaign.status ? ` (${campaign.status})` : ''

      return {
        value: campaign.id,
        label: `${title}${status}`
      }
    })

    logger.debug(`✅ [Mailchimp] Campaigns fetched successfully: ${formattedCampaigns.length} campaigns`)
    return formattedCampaigns

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
