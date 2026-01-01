/**
 * Mailchimp Segments Handler
 */

import { MailchimpIntegration, MailchimpSegment, MailchimpDataHandler } from '../types'
import {
  validateMailchimpIntegration,
  validateMailchimpToken,
  makeMailchimpApiRequest,
  parseMailchimpApiResponse,
  buildMailchimpApiUrl
} from '../utils'

import { logger } from '@/lib/utils/logger'

export const getMailchimpSegments: MailchimpDataHandler<MailchimpSegment> = async (
  integration: MailchimpIntegration,
  options: any = {}
): Promise<MailchimpSegment[]> => {
  // Support both audienceId and audience_id (field name varies by context)
  const audienceId = options.audienceId || options.audience_id

  logger.debug("🔍 [Mailchimp] Fetching segments:", {
    integrationId: integration.id,
    audienceId,
    options
  })

  try {
    if (!audienceId) {
      throw new Error('audienceId is required to fetch segments')
    }

    // Validate integration status
    validateMailchimpIntegration(integration)

    logger.debug(`🔍 [Mailchimp] Validating token...`)
    const tokenResult = await validateMailchimpToken(integration)

    if (!tokenResult.success) {
      logger.debug(`❌ [Mailchimp] Token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }

    logger.debug('🔍 [Mailchimp] Fetching segments from API...')
    const apiUrl = await buildMailchimpApiUrl(integration, `/lists/${audienceId}/segments`)

    // Add query parameters
    const url = new URL(apiUrl)
    url.searchParams.set('count', '1000')
    url.searchParams.set('fields', 'segments.id,segments.name,segments.member_count,segments.type,segments.created_at,segments.updated_at,segments.list_id')

    const response = await makeMailchimpApiRequest(url.toString(), tokenResult.token!)

    const segments = await parseMailchimpApiResponse<MailchimpSegment>(response)

    logger.debug(`✅ [Mailchimp] Segments fetched successfully: ${segments.length} segments`)
    return segments

  } catch (error: any) {
    logger.error("❌ [Mailchimp] Error fetching segments:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Mailchimp authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Mailchimp API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching Mailchimp segments")
  }
}
