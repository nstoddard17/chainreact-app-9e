import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(request: NextRequest) {
  try {
    const { integrationId, userId, config } = await request.json()

    if (!integrationId) {
      return errorResponse('Integration ID is required' , 400)
    }

    if (!userId) {
      return errorResponse('User ID is required' , 400)
    }

    if (!config) {
      return errorResponse('Config is required' , 400)
    }

    // Get integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single()

    if (integrationError || !integration) {
      return errorResponse('Integration not found' , 404)
    }

    // Check if the integration belongs to the user
    if (integration.user_id !== userId) {
      return errorResponse('Unauthorized' , 403)
    }

    // Validate and refresh token
    const { decrypt } = await import("@/lib/security/encryption")
    const { getSecret } = await import("@/lib/secrets")
    
    const secret = await getSecret("encryption_key")
    if (!secret) {
      return errorResponse('Encryption secret not configured' , 500)
    }

    let accessToken = integration.access_token
    if (accessToken.includes(":")) {
      try {
        accessToken = decrypt(accessToken, secret)
      } catch (decryptError) {
        return errorResponse('Token decryption failed' , 500)
      }
    }

    // Build the API URL with parameters
    const { limit = 25, calendarId, startDate, endDate } = config
    const maxResults = parseInt(limit as string, 10)
    
    let apiUrl = `https://graph.microsoft.com/v1.0/me/events?$top=${maxResults}&$select=id,subject,start,end,location,isAllDay,isCancelled,bodyPreview,attendees`
    
    // Add date filters if provided
    if (startDate || endDate) {
      const filterParts = []
      if (startDate) {
        filterParts.push(`start/dateTime ge '${startDate}T00:00:00Z'`)
      }
      if (endDate) {
        filterParts.push(`end/dateTime le '${endDate}T23:59:59Z'`)
      }
      if (filterParts.length > 0) {
        apiUrl += `&$filter=${filterParts.join(' and ')}`
      }
    }

    // Use specific calendar if provided
    if (calendarId) {
      apiUrl = `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events?$top=${maxResults}&$select=id,subject,start,end,location,isAllDay,isCancelled,bodyPreview,attendees`
      if (startDate || endDate) {
        const filterParts = []
        if (startDate) {
          filterParts.push(`start/dateTime ge '${startDate}T00:00:00Z'`)
        }
        if (endDate) {
          filterParts.push(`end/dateTime le '${endDate}T23:59:59Z'`)
        }
        if (filterParts.length > 0) {
          apiUrl += `&$filter=${filterParts.join(' and ')}`
        }
      }
    }

    logger.debug('Fetching calendar events from:', apiUrl)
    logger.debug('Access token length:', accessToken?.length || 0)

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Microsoft Graph API error:', response.status, errorText)
      
      // If it's a 401/403 error, try to refresh the token
      if (response.status === 401 || response.status === 403) {
        logger.debug('Attempting token refresh due to 401/403 error...')
        
        try {
          const { LegacyTokenRefreshService: TokenRefreshService } = await import("@/src/infrastructure/workflows/legacy-compatibility")
          
          // Decrypt refresh token if needed
          let refreshToken = integration.refresh_token
          if (refreshToken && refreshToken.includes(":")) {
            const { decrypt } = await import("@/lib/security/encryption")
            const { getSecret } = await import("@/lib/secrets")
            const secret = await getSecret("encryption_key")
            if (secret) {
              refreshToken = decrypt(refreshToken, secret)
            }
          }
          
          if (refreshToken) {
            const refreshResult = await TokenRefreshService.refreshTokenForProvider(
              "microsoft-outlook",
              refreshToken,
              integration
            )
            
            if (refreshResult.success && refreshResult.accessToken) {
              logger.debug('Token refresh successful, retrying API call...')
              
              // Retry the API call with the new token
              const retryResponse = await fetch(apiUrl, {
                headers: {
                  'Authorization': `Bearer ${refreshResult.accessToken}`,
                  'Content-Type': 'application/json'
                }
              })
              
              if (retryResponse.ok) {
                const data = await retryResponse.json()
                
                // Transform the data to match the expected format
                const events = data.value.map((event: any) => ({
                  id: event.id,
                  subject: event.subject,
                  start: event.start,
                  end: event.end,
                  location: event.location,
                  isAllDay: event.isAllDay,
                  isCancelled: event.isCancelled,
                  bodyPreview: event.bodyPreview
                }))

                return jsonResponse({
                  data: {
                    events,
                    totalCount: data['@odata.count'] || events.length
                  }
                })
              } 
                const retryErrorText = await retryResponse.text()
                logger.error('Retry failed:', retryResponse.status, retryErrorText)
              
            } else {
              logger.error('Token refresh failed:', refreshResult.error)
            }
          }
        } catch (refreshError) {
          logger.error('Error during token refresh:', refreshError)
        }
      }
      
      return jsonResponse({ 
        error: `Outlook API error: ${response.status} - ${errorText}` 
      }, { status: response.status })
    }

    const data = await response.json()
    
    // Transform the data to match the expected format
    const events = data.value.map((event: any) => ({
      id: event.id,
      subject: event.subject,
      start: event.start,
      end: event.end,
      location: event.location,
      isAllDay: event.isAllDay,
      isCancelled: event.isCancelled,
      bodyPreview: event.bodyPreview,
      attendees: event.attendees || []
    }))

    return jsonResponse({
      data: {
        events,
        totalCount: data['@odata.count'] || events.length
      }
    })

  } catch (error) {
    logger.error('Error fetching calendar events preview:', error)
    return errorResponse('Internal server error' , 500)
  }
} 