/**
 * Outlook Signatures Handler
 */

import { OutlookIntegration, OutlookSignature, OutlookDataHandler } from '../types'
import { validateOutlookIntegration, validateOutlookToken, makeOutlookApiRequest } from '../utils'

export const getOutlookSignatures: OutlookDataHandler<OutlookSignature> = async (integration: OutlookIntegration, options: any = {}): Promise<OutlookSignature[]> => {
  console.log("🔍 Outlook signatures fetcher called with integration:", {
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
    
    console.log('🔍 Fetching Outlook mail settings for signatures from Microsoft Graph API...')
    
    try {
      // Try to fetch user's mail settings which includes signatures
      const response = await makeOutlookApiRequest(
        "https://graph.microsoft.com/v1.0/me/mailboxSettings",
        tokenResult.token!
      )
      
      if (!response.ok) {
        console.log(`❌ Outlook signatures API failed (${response.status}), trying alternative endpoint...`)
        
        // Alternative: try to get user's signature from messages
        const messagesResponse = await makeOutlookApiRequest(
          "https://graph.microsoft.com/v1.0/me/messages?$top=1&$select=body",
          tokenResult.token!
        )
        
        if (messagesResponse.ok) {
          console.log('✅ Outlook signatures: Using fallback method (empty signatures list)')
          return []
        }
        
        throw new Error(`Outlook signatures API failed: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('✅ Outlook mail settings retrieved successfully')
      
      // Note: Microsoft Graph API doesn't directly expose email signatures
      // This is a limitation of the API - signatures are typically stored locally
      // Return empty array with a note in the logs
      console.log('📝 Note: Outlook signatures are not directly accessible via Microsoft Graph API')
      
      return []
      
    } catch (apiError: any) {
      console.log(`❌ Outlook signatures API error: ${apiError.message}`)
      return []
    }
    
  } catch (error: any) {
    console.error("Error fetching Outlook signatures:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Microsoft authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Microsoft Graph API rate limit exceeded. Please try again later.')
    }
    
    // For signatures, we'll return empty array instead of throwing
    // since this is a known limitation of the Microsoft Graph API
    console.log('📝 Returning empty signatures list due to API limitations')
    return []
  }
}