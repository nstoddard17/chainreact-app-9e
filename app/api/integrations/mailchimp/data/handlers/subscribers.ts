/**
 * Mailchimp Subscribers Handler
 */

import { MailchimpIntegration, MailchimpDataHandler } from '../types'
import {
  validateMailchimpIntegration,
  validateMailchimpToken,
  makeMailchimpApiRequest,
  buildMailchimpApiUrl
} from '../utils'

import { logger } from '@/lib/utils/logger'

export const handleMailchimpSubscribers: MailchimpDataHandler<any> = async (
  integration: MailchimpIntegration,
  options: any = {}
): Promise<any[]> => {
  const audienceId = options.audience_id

  logger.debug("🔍 [Mailchimp] Fetching subscribers for audience:", {
    audienceId,
    hasToken: !!integration.access_token
  })

  if (!audienceId) {
    logger.error('❌ [Mailchimp] Audience ID is required')
    throw new Error('Audience ID is required to fetch subscribers')
  }

  try {
    // Validate integration status
    validateMailchimpIntegration(integration)

    logger.debug(`🔍 [Mailchimp] Validating token...`)
    const tokenResult = await validateMailchimpToken(integration)

    if (!tokenResult.success) {
      logger.debug(`❌ [Mailchimp] Token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }

    logger.debug('🔍 [Mailchimp] Fetching subscribers from API...')
    const apiUrl = await buildMailchimpApiUrl(integration, `/lists/${audienceId}/members`)

    // Add query parameters
    const url = new URL(apiUrl)
    url.searchParams.set('count', '1000') // Get up to 1000 subscribers
    url.searchParams.set('status', 'subscribed') // Only get active subscribers

    const response = await makeMailchimpApiRequest(url.toString(), tokenResult.token!)
    const data = await response.json()
    const subscribers = data.members || []

    // Format as options with email as both value and label, and include subscriber details
    const formattedSubscribers = subscribers.map((subscriber: any) => {
      const fname = subscriber.merge_fields?.FNAME || ''
      const lname = subscriber.merge_fields?.LNAME || ''
      const fullName = fname || lname ? `${fname} ${lname}`.trim() : ''

      return {
        value: subscriber.email_address,
        label: fullName ? `${subscriber.email_address} (${fullName})` : subscriber.email_address,
        // Include subscriber data for potential use
        data: {
          id: subscriber.id,
          email: subscriber.email_address,
          firstName: fname,
          lastName: lname,
          status: subscriber.status,
          phone: subscriber.merge_fields?.PHONE,
          address: subscriber.merge_fields?.ADDRESS
        }
      }
    })

    logger.debug(`✅ [Mailchimp] Subscribers fetched successfully: ${formattedSubscribers.length} subscribers`)
    return formattedSubscribers

  } catch (error: any) {
    logger.error("❌ [Mailchimp] Error fetching subscribers:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Mailchimp authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Mailchimp API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching Mailchimp subscribers")
  }
}
