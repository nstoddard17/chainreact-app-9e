/**
 * HubSpot Company Properties Handler
 */

import { HubSpotIntegration, HubSpotProperty, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, parseHubSpotApiResponse, buildHubSpotApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getHubSpotCompanyProperties: HubSpotDataHandler<HubSpotProperty> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotProperty[]> => {
  logger.debug("🔍 HubSpot company properties fetcher called with integration:", {
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

    logger.debug('🔍 Fetching HubSpot company properties from API...')
    const apiUrl = buildHubSpotApiUrl('/crm/v3/properties/companies')

    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)

    const properties = await parseHubSpotApiResponse<HubSpotProperty>(response)

    logger.debug(`✅ HubSpot company properties fetched successfully: ${properties.length} properties`)
    return properties

  } catch (error: any) {
    logger.error("Error fetching HubSpot company properties:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching HubSpot company properties")
  }
}
