/**
 * Outlook Contacts Handler
 */

import { OutlookIntegration, OutlookContact, OutlookDataHandler } from '../types'
import { validateOutlookIntegration, validateOutlookToken, makeOutlookApiRequest, parseOutlookApiResponse } from '../utils'

export const getOutlookContacts: OutlookDataHandler<OutlookContact> = async (integration: OutlookIntegration, options: any = {}): Promise<OutlookContact[]> => {
  console.log("🔍 Outlook contacts fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length
  })
  
  try {
    // Validate integration status
    validateOutlookIntegration(integration)
    
    console.log(`🔍 Validating Outlook token...`)
    const tokenResult = await validateOutlookToken(integration)
    
    if (!tokenResult.success) {
      console.log(`❌ Outlook token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    console.log('🔍 Fetching Outlook contacts from Microsoft Graph API...')
    const response = await makeOutlookApiRequest(
      "https://graph.microsoft.com/v1.0/me/contacts?$top=100&$orderby=displayName",
      tokenResult.token!
    )
    
    const contacts = await parseOutlookApiResponse<OutlookContact>(response)
    
    console.log(`✅ Outlook contacts fetched successfully: ${contacts.length} contacts`)
    return contacts
    
  } catch (error: any) {
    console.error("Error fetching Outlook contacts:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Microsoft authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Microsoft Graph API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Outlook contacts")
  }
}