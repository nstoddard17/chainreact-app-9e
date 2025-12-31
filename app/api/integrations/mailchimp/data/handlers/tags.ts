/**
 * Mailchimp Tags Handler
 */

import { MailchimpIntegration, MailchimpTag, MailchimpDataHandler } from '../types'
import {
  validateMailchimpIntegration,
  validateMailchimpToken,
  makeMailchimpApiRequest,
  parseMailchimpApiResponse,
  buildMailchimpApiUrl
} from '../utils'

import { logger } from '@/lib/utils/logger'

export const getMailchimpTags: MailchimpDataHandler<MailchimpTag> = async (
  integration: MailchimpIntegration,
  options: any = {}
): Promise<MailchimpTag[]> => {
  // Support both audienceId and audience_id (field name varies by context)
  const audienceId = options.audienceId || options.audience_id

  logger.debug("🔍 [Mailchimp] Fetching tags:", {
    integrationId: integration.id,
    audienceId,
    options
  })

  try {
    if (!audienceId) {
      throw new Error('audienceId is required to fetch tags')
    }

    // Validate integration status
    validateMailchimpIntegration(integration)

    logger.debug(`🔍 [Mailchimp] Validating token...`)
    const tokenResult = await validateMailchimpToken(integration)

    if (!tokenResult.success) {
      logger.debug(`❌ [Mailchimp] Token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }

    logger.debug('🔍 [Mailchimp] Fetching tags from API...')
    const apiUrl = await buildMailchimpApiUrl(integration, `/lists/${audienceId}/tag-search`)

    // Add query parameters - we need to search with an empty string to get all tags
    const url = new URL(apiUrl)
    url.searchParams.set('count', '1000')

    const response = await makeMailchimpApiRequest(url.toString(), tokenResult.token!)

    const result = await response.json()

    // Tags come back in a different format - they're in a tags array
    const rawTags = result.tags || []

    // Format tags for dropdown: use name as both value and label
    // The Mailchimp API expects tag NAMES (not IDs) when adding/removing tags
    const tags = rawTags.map((tag: any) => ({
      value: tag.name,  // Use name as value - this is what the API expects
      label: tag.name,
      id: tag.id,       // Keep ID for reference
      member_count: tag.member_count
    }))

    logger.debug(`✅ [Mailchimp] Tags fetched successfully: ${tags.length} tags`)
    return tags

  } catch (error: any) {
    logger.error("❌ [Mailchimp] Error fetching tags:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Mailchimp authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Mailchimp API rate limit exceeded. Please try again later.')
    }

    // If tag-search doesn't work, return empty array (some accounts may not have this feature)
    if (error.message?.includes('404') || error.message?.includes('not found')) {
      logger.debug('⚠️ [Mailchimp] Tag search not available for this account')
      return []
    }

    throw new Error(error.message || "Error fetching Mailchimp tags")
  }
}
