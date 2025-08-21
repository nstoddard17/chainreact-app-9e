/**
 * HubSpot Contact Properties Handler
 */

import { HubSpotIntegration, HubSpotProperty, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, parseHubSpotApiResponse, buildHubSpotApiUrl } from '../utils'

export const getHubSpotContactProperties: HubSpotDataHandler<HubSpotProperty> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotProperty[]> => {
  console.log("🔍 HubSpot contact properties fetcher called with integration:", {
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
    
    console.log('🔍 Fetching HubSpot contact properties from API...')
    const apiUrl = buildHubSpotApiUrl('/crm/v3/properties/contacts')
    
    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)
    
    const properties = await parseHubSpotApiResponse<HubSpotProperty>(response)
    
    console.log(`✅ HubSpot contact properties fetched successfully: ${properties.length} properties`)
    return properties
    
  } catch (error: any) {
    console.error("Error fetching HubSpot contact properties:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching HubSpot contact properties")
  }
}