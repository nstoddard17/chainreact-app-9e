/**
 * Outlook Calendars Handler
 */

import { OutlookIntegration, OutlookCalendar, OutlookDataHandler } from '../types'
import { validateOutlookIntegration, validateOutlookToken, makeOutlookApiRequest, parseOutlookApiResponse } from '../utils'

export const getOutlookCalendars: OutlookDataHandler<OutlookCalendar> = async (integration: OutlookIntegration, options: any = {}): Promise<OutlookCalendar[]> => {
  console.log("🔍 Outlook calendars fetcher called with integration:", {
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
    
    console.log('🔍 Fetching Outlook calendars from Microsoft Graph API...')
    const response = await makeOutlookApiRequest(
      "https://graph.microsoft.com/v1.0/me/calendars",
      tokenResult.token!
    )
    
    const calendars = await parseOutlookApiResponse<OutlookCalendar>(response)
    
    console.log(`✅ Outlook calendars fetched successfully: ${calendars.length} calendars`)
    return calendars
    
  } catch (error: any) {
    console.error("Error fetching Outlook calendars:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Microsoft authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Microsoft Graph API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Outlook calendars")
  }
}