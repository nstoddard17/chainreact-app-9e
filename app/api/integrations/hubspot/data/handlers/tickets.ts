/**
 * HubSpot Tickets Handler
 *
 * API Verification:
 * - Endpoint: GET /crm/v3/objects/tickets
 * - Docs: https://developers.hubspot.com/docs/api/crm/tickets
 * - Scopes: tickets
 */

import { HubSpotIntegration, HubSpotTicket, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, parseHubSpotApiResponse, buildHubSpotApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getHubSpotTickets: HubSpotDataHandler<HubSpotTicket> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotTicket[]> => {
  logger.debug("🔍 HubSpot tickets fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length
  })

  try {
    // Validate integration status
    validateHubSpotIntegration(integration)

    logger.debug(`🔍 Validating HubSpot token...`)
    const tokenResult = await validateHubSpotToken(integration)

    if (!tokenResult.success) {
      logger.debug(`❌ HubSpot token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }

    logger.debug('🔍 Fetching HubSpot tickets from API...')
    const apiUrl = buildHubSpotApiUrl('/crm/v3/objects/tickets?limit=100&properties=subject,content,hs_pipeline,hs_pipeline_stage,hs_ticket_priority,hs_ticket_category,hubspot_owner_id,source_type,createdate,hs_lastmodifieddate')

    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)

    const tickets = await parseHubSpotApiResponse<HubSpotTicket>(response)

    logger.debug(`✅ HubSpot tickets fetched successfully: ${tickets.length} tickets`)
    return tickets

  } catch (error: any) {
    logger.error("Error fetching HubSpot tickets:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching HubSpot tickets")
  }
}
