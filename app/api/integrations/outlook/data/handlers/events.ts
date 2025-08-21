/**
 * Outlook Events Handler
 */

import { OutlookIntegration, OutlookEvent, OutlookDataHandler, OutlookHandlerOptions } from '../types'
import { validateOutlookIntegration, validateOutlookToken, makeOutlookApiRequest, parseOutlookApiResponse } from '../utils'

export const getOutlookEvents: OutlookDataHandler<OutlookEvent> = async (integration: OutlookIntegration, options: OutlookHandlerOptions = {}): Promise<OutlookEvent[]> => {
  const { calendarId, startDate, endDate } = options
  
  console.log("🔍 Outlook events fetcher called with:", {
    integrationId: integration.id,
    calendarId,
    startDate,
    endDate,
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
    
    // Build API URL based on whether we have a specific calendar
    let apiUrl = "https://graph.microsoft.com/v1.0/me/events"
    if (calendarId) {
      apiUrl = `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events`
    }
    
    // Build query parameters
    const queryParams = new URLSearchParams({
      '$top': '100',
      '$orderby': 'start/dateTime'
    })
    
    // Add date filtering if provided
    if (startDate && endDate) {
      queryParams.append('$filter', `start/dateTime ge '${startDate}' and end/dateTime le '${endDate}'`)
    } else if (startDate) {
      queryParams.append('$filter', `start/dateTime ge '${startDate}'`)
    } else if (endDate) {
      queryParams.append('$filter', `end/dateTime le '${endDate}'`)
    }
    
    const fullUrl = `${apiUrl}?${queryParams.toString()}`
    
    console.log(`🔍 Fetching Outlook events from: ${fullUrl}`)
    const response = await makeOutlookApiRequest(fullUrl, tokenResult.token!)
    
    const events = await parseOutlookApiResponse<OutlookEvent>(response)
    
    console.log(`✅ Outlook events fetched successfully: ${events.length} events`)
    return events
    
  } catch (error: any) {
    console.error("Error fetching Outlook events:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Microsoft authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Microsoft Graph API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Outlook events")
  }
}