/**
 * Outlook Messages Handler
 */

import { OutlookIntegration, OutlookMessage, OutlookDataHandler, OutlookHandlerOptions } from '../types'
import { validateOutlookIntegration, validateOutlookToken, makeOutlookApiRequest, parseOutlookApiResponse } from '../utils'

export const getOutlookMessages: OutlookDataHandler<OutlookMessage> = async (integration: OutlookIntegration, options: OutlookHandlerOptions = {}): Promise<OutlookMessage[]> => {
  const { folderId, limit = 50 } = options
  
  console.log("🔍 Outlook messages fetcher called with:", {
    integrationId: integration.id,
    folderId,
    limit,
    hasToken: !!integration.access_token
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
    
    // Build API URL based on whether we have a specific folder
    let apiUrl = "https://graph.microsoft.com/v1.0/me/messages"
    if (folderId) {
      apiUrl = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages`
    }
    
    // Add query parameters
    const queryParams = new URLSearchParams({
      '$top': limit.toString(),
      '$orderby': 'receivedDateTime desc',
      '$select': 'id,subject,bodyPreview,importance,isRead,isDraft,sentDateTime,receivedDateTime,hasAttachments,parentFolderId,from,toRecipients,ccRecipients,webLink'
    })
    
    const fullUrl = `${apiUrl}?${queryParams.toString()}`
    
    console.log(`🔍 Fetching Outlook messages from: ${fullUrl}`)
    const response = await makeOutlookApiRequest(fullUrl, tokenResult.token!)
    
    const messages = await parseOutlookApiResponse<OutlookMessage>(response)
    
    console.log(`✅ Outlook messages fetched successfully: ${messages.length} messages`)
    return messages
    
  } catch (error: any) {
    console.error("Error fetching Outlook messages:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Microsoft authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Microsoft Graph API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Outlook messages")
  }
}