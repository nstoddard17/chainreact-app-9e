/**
 * HubSpot Industries Handler
 */

import { HubSpotIntegration, HubSpotIndustry, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, buildHubSpotApiUrl } from '../utils'

export const getHubSpotIndustries: HubSpotDataHandler<HubSpotIndustry> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotIndustry[]> => {
  console.log("🔍 HubSpot industries fetcher called with integration:", {
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
    
    console.log('🔍 Fetching HubSpot industries from API...')
    const apiUrl = buildHubSpotApiUrl('/properties/v2/companies/properties/industry')
    
    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)
    
    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ HubSpot industries API error: ${response.status} ${JSON.stringify(data)}`)
      throw new Error(`HubSpot API error: ${response.status}`)
    }
    
    // Extract options from the property definition
    const industries = data.options || []
    
    console.log(`✅ HubSpot industries fetched successfully: ${industries.length} industries`)
    return industries
    
  } catch (error: any) {
    console.error("Error fetching HubSpot industries:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching HubSpot industries")
  }
}