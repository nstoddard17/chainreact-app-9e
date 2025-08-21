/**
 * HubSpot Deal Stages Handler
 */

import { HubSpotIntegration, HubSpotDealStage, HubSpotDataHandler, HubSpotHandlerOptions } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, parseHubSpotApiResponse, buildHubSpotApiUrl } from '../utils'

export const getHubSpotDealStages: HubSpotDataHandler<HubSpotDealStage> = async (integration: HubSpotIntegration, options: HubSpotHandlerOptions = {}): Promise<HubSpotDealStage[]> => {
  const { pipeline } = options
  
  console.log("🔍 HubSpot deal stages fetcher called with:", {
    integrationId: integration.id,
    pipeline,
    hasToken: !!integration.access_token
  })
  
  try {
    // Validate integration status
    validateHubSpotIntegration(integration)
    
    console.log(`🔍 Validating HubSpot token...`)
    const tokenResult = await validateHubSpotToken(integration)
    
    if (!tokenResult.success) {
      console.log(`❌ HubSpot token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    if (!pipeline) {
      throw new Error('Pipeline ID is required for fetching deal stages')
    }
    
    console.log('🔍 Fetching HubSpot deal stages from API...')
    const apiUrl = buildHubSpotApiUrl(`/crm/v3/pipelines/deals/${pipeline}`)
    
    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)
    
    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ HubSpot deal stages API error: ${response.status} ${JSON.stringify(data)}`)
      throw new Error(`HubSpot API error: ${response.status}`)
    }
    
    // Return the stages from the pipeline
    const stages = data.stages || []
    
    console.log(`✅ HubSpot deal stages fetched successfully: ${stages.length} stages`)
    return stages
    
  } catch (error: any) {
    console.error("Error fetching HubSpot deal stages:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching HubSpot deal stages")
  }
}