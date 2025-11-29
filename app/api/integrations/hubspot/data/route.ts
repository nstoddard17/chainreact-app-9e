/**
 * HubSpot Integration Data API Route
 * Handles HubSpot data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { hubspotHandlers } from './handlers'
import { HubSpotIntegration } from './types'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SECRET_KEY || ""

if (!supabaseUrl || !supabaseKey) {
  logger.error('❌ [HubSpot API] Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    let integrationId, dataType, options = {}
    
    try {
      const body = await req.json()
      integrationId = body.integrationId
      dataType = body.dataType
      options = body.options || {}
      
      logger.debug('📥 [HubSpot API] Received request:', {
        integrationId,
        dataType,
        options
      })
    } catch (parseError) {
      logger.error('❌ [HubSpot API] Failed to parse request body:', parseError)
      return errorResponse('Invalid JSON in request body', 400, { details: parseError.message
       })
    }

    // Validate required parameters
    if (!integrationId || !dataType) {
      return errorResponse('Missing required parameters: integrationId and dataType'
      , 400)
    }

    // Fetch integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'hubspot')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [HubSpot API] Integration not found:', { integrationId, error: integrationError })
      return errorResponse('HubSpot integration not found'
      , 404)
    }

    // Validate integration status
    if (integration.status !== 'connected') {
      logger.error('❌ [HubSpot API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return errorResponse('HubSpot integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = hubspotHandlers[dataType]
    if (!handler) {
      logger.error('❌ [HubSpot API] Unknown data type:', dataType)
      return jsonResponse({
        error: `Unknown HubSpot data type: ${dataType}`,
        availableTypes: Object.keys(hubspotHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [HubSpot API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    let data
    try {
      data = await handler(integration as HubSpotIntegration, options)
    } catch (handlerError: any) {
      logger.error('❌ [HubSpot API] Handler execution failed:', {
        dataType,
        error: handlerError.message,
        stack: handlerError.stack,
        integrationId
      })

      // Check if this is an authentication/authorization error that needs reconnection
      // IMPORTANT: Only mark as needs_reauthorization for explicit auth failures (401/403)
      // Don't mark on transient errors, timeouts, or network issues
      const isExplicitAuthError = handlerError.status === 401 || handlerError.status === 403
      const isTokenExpiredError =
        handlerError.message?.toLowerCase().includes('token expired') ||
        handlerError.message?.toLowerCase().includes('invalid token') ||
        handlerError.message?.toLowerCase().includes('token is no longer valid')

      const needsReconnection = isExplicitAuthError || isTokenExpiredError

      // If reconnection is needed, update the integration status in the database
      if (needsReconnection) {
        logger.warn(`⚠️ [HubSpot API] Marking integration ${integrationId} as needs_reauthorization`, {
          status: handlerError.status,
          message: handlerError.message,
          isExplicitAuthError,
          isTokenExpiredError
        })

        try {
          await supabase
            .from('integrations')
            .update({
              status: 'needs_reauthorization',
              disconnect_reason: handlerError.message || 'Authentication failed',
              disconnected_at: new Date().toISOString(),
              consecutive_failures: (integration.consecutive_failures || 0) + 1
            })
            .eq('id', integrationId)
        } catch (updateError: any) {
          logger.error('❌ [HubSpot API] Failed to update integration status:', updateError)
        }
      } else {
        logger.debug('❌ [HubSpot API] Error is not an auth issue, not marking as needs_reauthorization', {
          status: handlerError.status,
          message: handlerError.message
        })
      }

      // Return a proper error response
      return errorResponse(handlerError.message || 'Failed to fetch HubSpot data', 500, {
        details: process.env.NODE_ENV === 'development' ? handlerError.stack : undefined,
        needsReconnection
      })
    }

    logger.debug(`✅ [HubSpot API] Successfully processed ${dataType}:`, {
      integrationId,
      resultCount: data?.length || 0
    })

    return jsonResponse({
      data,
      success: true,
      integrationId,
      dataType
    })

  } catch (error: any) {
    logger.error('❌ [HubSpot API] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })

    // Check if this is an authentication/authorization error that needs reconnection
    // IMPORTANT: Use same specific logic as handler error block
    const isExplicitAuthError = error.status === 401 || error.status === 403
    const isTokenExpiredError =
      error.message?.toLowerCase().includes('token expired') ||
      error.message?.toLowerCase().includes('invalid token') ||
      error.message?.toLowerCase().includes('token is no longer valid') ||
      error.message?.toLowerCase().includes('authentication expired')

    const needsReconnection = isExplicitAuthError || isTokenExpiredError

    // Handle authentication errors
    if (needsReconnection) {
      return errorResponse(error.message, 401, { needsReconnection: true
       })
    }

    // Handle rate limit errors
    if (error.message?.includes('rate limit')) {
      return errorResponse('HubSpot API rate limit exceeded. Please try again later.', 429, { retryAfter: 60
       })
    }

    return errorResponse(error.message || 'Internal server error', 500, { details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     })
  }
}