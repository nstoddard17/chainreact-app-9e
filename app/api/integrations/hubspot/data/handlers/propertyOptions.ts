/**
 * HubSpot Property Options Handlers
 * Fetches the actual options for enumeration properties from HubSpot
 */

import { HubSpotIntegration, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, buildHubSpotApiUrl } from '../utils'

interface PropertyOption {
  label: string
  value: string
}

/**
 * Generic function to fetch options for a specific contact property
 */
async function getContactPropertyOptions(
  integration: HubSpotIntegration,
  propertyName: string
): Promise<PropertyOption[]> {
  try {
    // Validate integration status
    validateHubSpotIntegration(integration)

    const tokenResult = await validateHubSpotToken(integration)

    if (!tokenResult.success) {
      throw new Error(tokenResult.error || "Authentication failed")
    }

    console.log(`🔍 Fetching options for property: ${propertyName}`)
    const apiUrl = buildHubSpotApiUrl(`/crm/v3/properties/contacts/${propertyName}`)

    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Failed to fetch property ${propertyName}: ${response.status}`)

      // Return empty array if property doesn't exist
      if (response.status === 404) {
        console.log(`⚠️ Property ${propertyName} not found, returning empty options`)
        return []
      }

      throw new Error(`HubSpot API error: ${response.status}`)
    }

    const data = await response.json()

    // Extract options if it's an enumeration property
    if (data.type === 'enumeration' && data.options) {
      const options = data.options.map((opt: any) => ({
        label: opt.label,
        value: opt.value
      }))

      console.log(`✅ Found ${options.length} options for ${propertyName}`)
      return options
    }

    console.log(`⚠️ Property ${propertyName} is not an enumeration, returning empty options`)
    return []

  } catch (error: any) {
    console.error(`Error fetching options for ${propertyName}:`, error)
    // Return empty array on error to allow form to still function
    return []
  }
}

/**
 * Get Lead Status options
 */
export const getHubSpotLeadStatusOptions: HubSpotDataHandler<PropertyOption> = async (
  integration: HubSpotIntegration,
  options: any = {}
): Promise<PropertyOption[]> => {
  console.log("🔍 HubSpot lead status options fetcher called")

  const statusOptions = await getContactPropertyOptions(integration, 'hs_lead_status')

  // If no options found, return default options
  if (statusOptions.length === 0) {
    return [
      { label: 'New', value: 'NEW' },
      { label: 'Open', value: 'OPEN' },
      { label: 'In Progress', value: 'IN_PROGRESS' },
      { label: 'Open Deal', value: 'OPEN_DEAL' },
      { label: 'Unqualified', value: 'UNQUALIFIED' },
      { label: 'Attempted to Contact', value: 'ATTEMPTED_TO_CONTACT' },
      { label: 'Connected', value: 'CONNECTED' },
      { label: 'Bad Timing', value: 'BAD_TIMING' }
    ]
  }

  return statusOptions
}

/**
 * Get Favorite Content Topics options
 */
export const getHubSpotContentTopicsOptions: HubSpotDataHandler<PropertyOption> = async (
  integration: HubSpotIntegration,
  options: any = {}
): Promise<PropertyOption[]> => {
  console.log("🔍 HubSpot content topics options fetcher called")

  const topicsOptions = await getContactPropertyOptions(integration, 'favorite_content_topics')

  // If no options found, return some default suggestions
  if (topicsOptions.length === 0) {
    return [
      { label: 'Marketing', value: 'marketing' },
      { label: 'Sales', value: 'sales' },
      { label: 'Technology', value: 'technology' },
      { label: 'Product Updates', value: 'product_updates' },
      { label: 'Industry News', value: 'industry_news' },
      { label: 'Best Practices', value: 'best_practices' },
      { label: 'Case Studies', value: 'case_studies' },
      { label: 'Events', value: 'events' }
    ]
  }

  return topicsOptions
}

/**
 * Get Preferred Channels options
 */
export const getHubSpotPreferredChannelsOptions: HubSpotDataHandler<PropertyOption> = async (
  integration: HubSpotIntegration,
  options: any = {}
): Promise<PropertyOption[]> => {
  console.log("🔍 HubSpot preferred channels options fetcher called")

  const channelsOptions = await getContactPropertyOptions(integration, 'preferred_channels')

  // If no options found, return some default suggestions
  if (channelsOptions.length === 0) {
    return [
      { label: 'Email', value: 'email' },
      { label: 'Phone', value: 'phone' },
      { label: 'SMS', value: 'sms' },
      { label: 'WhatsApp', value: 'whatsapp' },
      { label: 'LinkedIn', value: 'linkedin' },
      { label: 'In-Person Meeting', value: 'in_person' },
      { label: 'Video Call', value: 'video_call' },
      { label: 'No Preference', value: 'no_preference' }
    ]
  }

  return channelsOptions
}