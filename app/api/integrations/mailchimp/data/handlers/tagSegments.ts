/**
 * Mailchimp Tag Segments Handler
 *
 * Returns tags as segments (with segment IDs as values) for trigger polling.
 * Tags in Mailchimp are static segments — this handler queries the segments API
 * with type=static to only return tags, using segment IDs as values so the
 * poller can query /segments/{id}/members.
 */

import { MailchimpIntegration, MailchimpSegment, MailchimpDataHandler } from '../types'
import {
  validateMailchimpIntegration,
  validateMailchimpToken,
  makeMailchimpApiRequest,
  buildMailchimpApiUrl
} from '../utils'

import { logger } from '@/lib/utils/logger'

export const getMailchimpTagSegments: MailchimpDataHandler<MailchimpSegment> = async (
  integration: MailchimpIntegration,
  options: any = {}
): Promise<MailchimpSegment[]> => {
  const audienceId = options.audienceId || options.audience_id

  try {
    if (!audienceId) {
      throw new Error('audienceId is required to fetch tags')
    }

    validateMailchimpIntegration(integration)
    const tokenResult = await validateMailchimpToken(integration)

    if (!tokenResult.success) {
      throw new Error(tokenResult.error || "Authentication failed")
    }

    const apiUrl = await buildMailchimpApiUrl(integration, `/lists/${audienceId}/segments`)
    const url = new URL(apiUrl)
    url.searchParams.set('type', 'static')
    url.searchParams.set('count', '1000')
    url.searchParams.set('fields', 'segments.id,segments.name,segments.member_count,segments.type,segments.created_at,segments.updated_at,segments.list_id')

    const response = await makeMailchimpApiRequest(url.toString(), tokenResult.token!)

    const result = await response.json()
    const segments = (result.segments || []).map((seg: any) => ({
      id: seg.id,
      value: String(seg.id),
      label: seg.name,
      name: seg.name,
      member_count: seg.member_count,
      type: seg.type,
    }))

    logger.info(`[Mailchimp] Tag segments fetched: ${segments.length} tags`)
    return segments

  } catch (error: any) {
    logger.error("[Mailchimp] Error fetching tag segments:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Mailchimp authentication expired. Please reconnect your account.')
    }

    throw new Error(error.message || "Error fetching Mailchimp tag segments")
  }
}
