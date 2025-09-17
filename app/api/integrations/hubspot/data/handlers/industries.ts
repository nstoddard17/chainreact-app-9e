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
    // HubSpot v3 API endpoint for getting industry property with its options
    const apiUrl = buildHubSpotApiUrl('/crm/v3/properties/companies/industry')

    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ HubSpot industries API error: ${response.status} ${errorText.substring(0, 500)}`)

      // If the property doesn't exist or there's an issue, return a default list
      if (response.status === 404 || response.status === 400) {
        console.log('⚠️ Using default industries list')
        return getDefaultIndustries()
      }

      throw new Error(`HubSpot API error: ${response.status}`)
    }

    const data = await response.json()

    // Extract options from the property definition
    const industries = data.options?.map((opt: any) => ({
      label: opt.label,
      value: opt.value
    })) || getDefaultIndustries()
    
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

// Default industries list as fallback
function getDefaultIndustries(): HubSpotIndustry[] {
  return [
    { label: 'Technology', value: 'technology' },
    { label: 'Healthcare', value: 'healthcare' },
    { label: 'Finance', value: 'finance' },
    { label: 'Education', value: 'education' },
    { label: 'Retail', value: 'retail' },
    { label: 'Manufacturing', value: 'manufacturing' },
    { label: 'Real Estate', value: 'real_estate' },
    { label: 'Construction', value: 'construction' },
    { label: 'Transportation', value: 'transportation' },
    { label: 'Hospitality', value: 'hospitality' },
    { label: 'Media & Entertainment', value: 'media_entertainment' },
    { label: 'Telecommunications', value: 'telecommunications' },
    { label: 'Energy', value: 'energy' },
    { label: 'Agriculture', value: 'agriculture' },
    { label: 'Legal', value: 'legal' },
    { label: 'Consulting', value: 'consulting' },
    { label: 'Government', value: 'government' },
    { label: 'Non-Profit', value: 'non_profit' },
    { label: 'Other', value: 'other' }
  ]
}