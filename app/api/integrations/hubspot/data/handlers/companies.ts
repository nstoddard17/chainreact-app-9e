/**
 * HubSpot Companies Handler
 */

import { HubSpotIntegration, HubSpotCompany, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, parseHubSpotApiResponse, buildHubSpotApiUrl } from '../utils'

export const getHubSpotCompanies: HubSpotDataHandler<HubSpotCompany> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotCompany[]> => {
  console.log("🔍 HubSpot companies fetcher called with integration:", {
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
    
    console.log('🔍 Fetching HubSpot companies from API...')
    const apiUrl = buildHubSpotApiUrl('/crm/v3/objects/companies?limit=100&properties=name,domain,city,state,country,industry,phone,website,createdate,hs_lastmodifieddate,numberofemployees,annualrevenue,description')
    
    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)
    
    const companies = await parseHubSpotApiResponse<HubSpotCompany>(response)
    
    console.log(`✅ HubSpot companies fetched successfully: ${companies.length} companies`)
    return companies
    
  } catch (error: any) {
    console.error("Error fetching HubSpot companies:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching HubSpot companies")
  }
}