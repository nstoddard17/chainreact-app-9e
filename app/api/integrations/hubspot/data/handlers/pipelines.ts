/**
 * HubSpot Pipelines Handler
 */

import { HubSpotIntegration, HubSpotPipeline, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, parseHubSpotApiResponse, buildHubSpotApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getHubSpotPipelines: HubSpotDataHandler<HubSpotPipeline> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotPipeline[]> => {
  logger.debug("🔍 HubSpot pipelines fetcher called with integration:", {
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
    
    logger.debug('🔍 Fetching HubSpot pipelines from API...')
    const apiUrl = buildHubSpotApiUrl('/crm/v3/pipelines/deals')
    
    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)
    
    const pipelines = await parseHubSpotApiResponse<HubSpotPipeline>(response)
    
    logger.debug(`✅ HubSpot pipelines fetched successfully: ${pipelines.length} pipelines`)
    return pipelines
    
  } catch (error: any) {
    logger.error("Error fetching HubSpot pipelines:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching HubSpot pipelines")
  }
}