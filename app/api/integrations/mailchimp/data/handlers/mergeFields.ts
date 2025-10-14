/**
 * Mailchimp Merge Fields Handler
 */

import { MailchimpIntegration, MailchimpMergeField, MailchimpDataHandler } from '../types'
import {
  validateMailchimpIntegration,
  validateMailchimpToken,
  makeMailchimpApiRequest,
  parseMailchimpApiResponse,
  buildMailchimpApiUrl
} from '../utils'

import { logger } from '@/lib/utils/logger'

export const getMailchimpMergeFields: MailchimpDataHandler<MailchimpMergeField> = async (
  integration: MailchimpIntegration,
  options: any = {}
): Promise<MailchimpMergeField[]> => {
  const { audienceId } = options

  logger.debug("🔍 [Mailchimp] Fetching merge fields:", {
    integrationId: integration.id,
    audienceId
  })

  try {
    if (!audienceId) {
      throw new Error('audienceId is required to fetch merge fields')
    }

    // Validate integration status
    validateMailchimpIntegration(integration)

    logger.debug(`🔍 [Mailchimp] Validating token...`)
    const tokenResult = await validateMailchimpToken(integration)

    if (!tokenResult.success) {
      logger.debug(`❌ [Mailchimp] Token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }

    logger.debug('🔍 [Mailchimp] Fetching merge fields from API...')
    const apiUrl = await buildMailchimpApiUrl(integration, `/lists/${audienceId}/merge-fields`)

    // Add query parameters
    const url = new URL(apiUrl)
    url.searchParams.set('count', '100')

    const response = await makeMailchimpApiRequest(url.toString(), tokenResult.token!)

    const mergeFields = await parseMailchimpApiResponse<MailchimpMergeField>(response)

    // Sort by display order
    const sortedFields = mergeFields.sort((a, b) => a.display_order - b.display_order)

    logger.debug(`✅ [Mailchimp] Merge fields fetched successfully: ${sortedFields.length} fields`)
    return sortedFields

  } catch (error: any) {
    logger.error("❌ [Mailchimp] Error fetching merge fields:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Mailchimp authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Mailchimp API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching Mailchimp merge fields")
  }
}
