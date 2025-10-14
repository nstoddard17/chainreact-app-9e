/**
 * Microsoft Excel Integration Data API Route
 * Handles Excel data requests using Microsoft Graph API through OneDrive integration
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { microsoftExcelHandlers } from './handlers'
import { MicrosoftExcelIntegration } from './types'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    const { integrationId, dataType, options = {} } = await req.json()

    // Validate required parameters
    if (!dataType) {
      return errorResponse('Missing required parameter: dataType'
      , 400)
    }

    // If integrationId is provided, first get that integration to find the user
    let userId: string | null = null
    if (integrationId) {
      const { data: requestingIntegration, error: requestingError } = await supabase
        .from('integrations')
        .select('user_id')
        .eq('id', integrationId)
        .single()

      if (!requestingError && requestingIntegration) {
        userId = requestingIntegration.user_id
        logger.debug('📊 [Microsoft Excel API] Found user from integrationId:', { integrationId, userId })
      }
    }

    // For Microsoft Excel, we need to fetch the OneDrive integration
    // since Excel uses the Graph API through OneDrive authentication
    let query = supabase
      .from('integrations')
      .select('*')
      .or('provider.eq.onedrive,provider.eq.microsoft-onedrive,provider.eq.microsoft_onedrive')

    // Filter by user if we have the userId
    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data: integrations, error: integrationError } = await query

    if (integrationError || !integrations || integrations.length === 0) {
      logger.error('❌ [Microsoft Excel API] OneDrive integration not found:', { error: integrationError, userId })
      return errorResponse('Microsoft Excel requires OneDrive connection. Please connect your OneDrive account first.'
      , 404)
    }

    // Use the first connected OneDrive integration
    const integration = integrations.find(i => i.status === 'connected')

    if (!integration) {
      logger.error('❌ [Microsoft Excel API] OneDrive integration not connected')
      return errorResponse('Microsoft Excel requires an active OneDrive connection. Please connect your OneDrive account.', 400, { needsReconnection: true
       })
    }

    // Validate integration status
    if (integration.status !== 'connected') {
      logger.error('❌ [Microsoft Excel API] OneDrive integration not connected:', {
        status: integration.status
      })
      return errorResponse('OneDrive integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = microsoftExcelHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Microsoft Excel API] Unknown data type:', dataType)
      return jsonResponse({
        error: `Unknown Microsoft Excel data type: ${dataType}`,
        availableTypes: Object.keys(microsoftExcelHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [Microsoft Excel API] Processing request:`, {
      dataType,
      userId,
      integrationId,
      status: integration.status,
      hasToken: !!integration.access_token,
      provider: integration.provider,
      options
    })

    // Execute the handler
    const data = await handler(integration as MicrosoftExcelIntegration, options)

    logger.debug(`✅ [Microsoft Excel API] Successfully processed ${dataType}:`, {
      resultCount: Array.isArray(data) ? data.length : 1
    })

    return jsonResponse({
      data,
      success: true,
      dataType
    })

  } catch (error: any) {
    logger.error('❌ [Microsoft Excel API] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })

    // Handle authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      return errorResponse(error.message, 401, { needsReconnection: true
       })
    }

    // Handle rate limit errors
    if (error.message?.includes('rate limit')) {
      return errorResponse('Microsoft Graph API rate limit exceeded. Please try again later.'
      , 429)
    }

    return errorResponse(error.message || 'Failed to fetch Excel data', 500, { details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     })
  }
}