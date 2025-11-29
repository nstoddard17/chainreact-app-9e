import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SECRET_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { integrationId, userId, config } = body

    if (!integrationId) {
      return errorResponse('Integration ID is required' , 400)
    }

    if (!userId) {
      return errorResponse('User ID is required' , 400)
    }

    if (!config) {
      return errorResponse('Config is required' , 400)
    }

    const { query, folderId, maxResults = 5, unreadOnly = false } = config

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

    // Build the Microsoft Graph API URL
    let apiUrl = 'https://graph.microsoft.com/v1.0/me/messages'
    
    // Add query parameters
    const params = new URLSearchParams()
    if (query) {
      params.append('$search', `"${query}"`)
    }
    if (unreadOnly) {
      params.append('$filter', 'isRead eq false')
    }
    if (folderId) {
      apiUrl = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages`
    }
    params.append('$top', maxResults.toString())
    params.append('$select', 'id,subject,from,receivedDateTime,hasAttachments,isRead')
    params.append('$orderby', 'receivedDateTime desc')

    if (params.toString()) {
      apiUrl += `?${params.toString()}`
    }

    // Make the API request
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Outlook API error:', response.status, errorText)
      return jsonResponse({ 
        error: `Outlook API error: ${response.status} - ${errorText}` 
      }, { status: response.status })
    }

    const data = await response.json()
    
    // Transform the data for preview
    const previewData = (data.value || []).map((message: any) => ({
      id: message.id,
      subject: message.subject || '(No Subject)',
      from: message.from?.emailAddress?.address || 'Unknown',
      receivedDateTime: message.receivedDateTime,
      hasAttachments: message.hasAttachments,
      isRead: message.isRead,
      snippet: message.bodyPreview || ''
    }))

    return jsonResponse({
      data: previewData,
      totalCount: data['@odata.count'] || previewData.length,
      query: query || 'All messages',
      folderId: folderId || 'All folders'
    })

  } catch (error: any) {
    logger.error('Outlook search emails preview error:', error)
    return errorResponse(error.message || 'Internal server error' 
    , 500)
  }
} 