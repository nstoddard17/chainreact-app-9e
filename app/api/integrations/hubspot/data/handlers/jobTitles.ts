/**
 * HubSpot Job Titles Handler
 */

import { HubSpotIntegration, HubSpotJobTitle, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, buildHubSpotApiUrl } from '../utils'

export const getHubSpotJobTitles: HubSpotDataHandler<HubSpotJobTitle> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotJobTitle[]> => {
  console.log("🔍 HubSpot job titles fetcher called with integration:", {
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
    
    console.log('🔍 Fetching HubSpot job titles from API...')
    const apiUrl = buildHubSpotApiUrl('/properties/v2/contacts/properties/jobtitle')
    
    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)
    
    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ HubSpot job titles API error: ${response.status} ${JSON.stringify(data)}`)
      throw new Error(`HubSpot API error: ${response.status}`)
    }
    
    // Extract options from the property definition
    const jobTitles = data.options || []
    
    console.log(`✅ HubSpot job titles fetched successfully: ${jobTitles.length} job titles`)
    return jobTitles
    
  } catch (error: any) {
    console.error("Error fetching HubSpot job titles:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching HubSpot job titles")
  }
}