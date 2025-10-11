/**
 * Mailchimp Audiences (Lists) Handler
 */

import { MailchimpIntegration, MailchimpAudience, MailchimpDataHandler } from '../types'
import {
  validateMailchimpIntegration,
  validateMailchimpToken,
  makeMailchimpApiRequest,
  parseMailchimpApiResponse,
  buildMailchimpApiUrl
} from '../utils'

export const getMailchimpAudiences: MailchimpDataHandler<MailchimpAudience> = async (
  integration: MailchimpIntegration,
  options: any = {}
): Promise<MailchimpAudience[]> => {
  console.log("🔍 [Mailchimp] Fetching audiences for integration:", {
    id: integration.id,
    hasToken: !!integration.access_token
  })

  try {
    // Validate integration status
    validateMailchimpIntegration(integration)

    console.log(`🔍 [Mailchimp] Validating token...`)
    const tokenResult = await validateMailchimpToken(integration)

    if (!tokenResult.success) {
      console.log(`❌ [Mailchimp] Token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }

    console.log('🔍 [Mailchimp] Fetching audiences from API...')
    const apiUrl = buildMailchimpApiUrl(integration, '/lists')

    // Add query parameters
    const url = new URL(apiUrl)
    url.searchParams.set('count', '1000') // Get up to 1000 audiences
    url.searchParams.set('fields', 'lists.id,lists.name,lists.web_id,lists.stats')

    const response = await makeMailchimpApiRequest(url.toString(), tokenResult.token!)

    const audiences = await parseMailchimpApiResponse<MailchimpAudience>(response)

    console.log(`✅ [Mailchimp] Audiences fetched successfully: ${audiences.length} audiences`)
    return audiences

  } catch (error: any) {
    console.error("❌ [Mailchimp] Error fetching audiences:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Mailchimp authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Mailchimp API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching Mailchimp audiences")
  }
}
