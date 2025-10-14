/**
 * HubSpot Lists Handler
 */

import { HubSpotIntegration, HubSpotList, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, parseHubSpotApiResponse, buildHubSpotApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getHubSpotLists: HubSpotDataHandler<HubSpotList> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotList[]> => {
  logger.debug("🔍 HubSpot lists fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length,
    status: integration.status,
    integrationKeys: Object.keys(integration || {})
  })
  
  try {
    // Validate integration status
    logger.debug('🔍 Validating HubSpot integration...')
    validateHubSpotIntegration(integration)
    
    logger.debug(`🔍 Validating HubSpot token...`)
    const tokenResult = await validateHubSpotToken(integration)
    
    if (!tokenResult.success) {
      logger.debug(`❌ HubSpot token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    logger.debug('🔍 Fetching HubSpot lists from API...')
    const apiUrl = buildHubSpotApiUrl('/contacts/v1/lists?count=100')
    
    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)
    
    const data = await response.json()
    
    if (!response.ok) {
      logger.error(`❌ HubSpot lists API error: ${response.status} ${JSON.stringify(data)}`)
      throw new Error(`HubSpot API error: ${response.status}`)
    }
    
    // HubSpot lists API returns data in 'lists' property
    const lists = data.lists || []
    
    logger.debug(`✅ HubSpot lists fetched successfully: ${lists.length} lists`)
    return lists
    
  } catch (error: any) {
    logger.error("Error fetching HubSpot lists:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching HubSpot lists")
  }
}