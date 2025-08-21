/**
 * HubSpot Departments Handler
 */

import { HubSpotIntegration, HubSpotDepartment, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, buildHubSpotApiUrl } from '../utils'

export const getHubSpotDepartments: HubSpotDataHandler<HubSpotDepartment> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotDepartment[]> => {
  console.log("🔍 HubSpot departments fetcher called with integration:", {
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
    
    console.log('🔍 Fetching HubSpot departments from API...')
    const apiUrl = buildHubSpotApiUrl('/properties/v2/contacts/properties/hs_department')
    
    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)
    
    const data = await response.json()
    
    if (!response.ok) {
      console.error(`❌ HubSpot departments API error: ${response.status} ${JSON.stringify(data)}`)
      throw new Error(`HubSpot API error: ${response.status}`)
    }
    
    // Extract options from the property definition
    const departments = data.options || []
    
    console.log(`✅ HubSpot departments fetched successfully: ${departments.length} departments`)
    return departments
    
  } catch (error: any) {
    console.error("Error fetching HubSpot departments:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching HubSpot departments")
  }
}