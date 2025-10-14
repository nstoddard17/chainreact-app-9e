/**
 * Blackbaud Integration Data API Route
 * Handles Blackbaud data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { blackbaudHandlers } from './handlers'
import { BlackbaudIntegration } from './types'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    const { integrationId, dataType, options = {} } = await req.json()

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
      .eq('provider', 'blackbaud')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Blackbaud API] Integration not found:', { integrationId, error: integrationError })
      return errorResponse('Blackbaud integration not found'
      , 404)
    }

    // Validate integration status
    if (integration.status !== 'connected') {
      logger.error('❌ [Blackbaud API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return errorResponse('Blackbaud integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = blackbaudHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Blackbaud API] Unknown data type:', dataType)
      return jsonResponse({
        error: `Unknown Blackbaud data type: ${dataType}`,
        availableTypes: Object.keys(blackbaudHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [Blackbaud API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const data = await handler(integration as BlackbaudIntegration, options)

    logger.debug(`✅ [Blackbaud API] Successfully processed ${dataType}:`, {
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
    logger.error('❌ [Blackbaud API] Unexpected error:', {
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
      return errorResponse('Blackbaud API rate limit exceeded. Please try again later.', 429, { retryAfter: 60
       })
    }

    return errorResponse(error.message || 'Internal server error', 500, { details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     })
  }
}