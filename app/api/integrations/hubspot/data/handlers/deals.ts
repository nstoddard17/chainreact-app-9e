/**
 * HubSpot Deals Handler
 */

import { HubSpotIntegration, HubSpotDeal, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, parseHubSpotApiResponse, buildHubSpotApiUrl } from '../utils'

export const getHubSpotDeals: HubSpotDataHandler<HubSpotDeal> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotDeal[]> => {
  console.log("🔍 HubSpot deals fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length
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
    
    console.log('🔍 Fetching HubSpot deals from API...')
    const apiUrl = buildHubSpotApiUrl('/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,pipeline,amount,closedate,createdate,hs_lastmodifieddate,hubspot_owner_id,dealtype,description')
    
    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)
    
    const deals = await parseHubSpotApiResponse<HubSpotDeal>(response)
    
    console.log(`✅ HubSpot deals fetched successfully: ${deals.length} deals`)
    return deals
    
  } catch (error: any) {
    console.error("Error fetching HubSpot deals:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching HubSpot deals")
  }
}