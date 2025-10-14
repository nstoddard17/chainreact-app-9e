/**
 * HubSpot Contacts Handler
 */

import { HubSpotIntegration, HubSpotContact, HubSpotDataHandler } from '../types'
import { validateHubSpotIntegration, validateHubSpotToken, makeHubSpotApiRequest, parseHubSpotApiResponse, buildHubSpotApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getHubSpotContacts: HubSpotDataHandler<HubSpotContact> = async (integration: HubSpotIntegration, options: any = {}): Promise<HubSpotContact[]> => {
  logger.debug("🔍 HubSpot contacts fetcher called with integration:", {
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
    
    logger.debug('🔍 Fetching HubSpot contacts from API...')
    const apiUrl = buildHubSpotApiUrl('/crm/v3/objects/contacts?limit=100&properties=firstname,lastname,email,phone,company,jobtitle,city,state,country,createdate,lastmodifieddate,hs_lead_status,lifecyclestage')
    
    const response = await makeHubSpotApiRequest(apiUrl, tokenResult.token!)
    
    const contacts = await parseHubSpotApiResponse<HubSpotContact>(response)
    
    logger.debug(`✅ HubSpot contacts fetched successfully: ${contacts.length} contacts`)
    return contacts
    
  } catch (error: any) {
    logger.error("Error fetching HubSpot contacts:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('HubSpot authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('HubSpot API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching HubSpot contacts")
  }
}