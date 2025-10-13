/**
 * Gumroad Integration Data API Route
 * Handles Gumroad data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { gumroadHandlers } from './handlers'
import { GumroadIntegration } from './types'

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
      .eq('provider', 'gumroad')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Gumroad API] Integration not found:', { integrationId, error: integrationError })
      return errorResponse('Gumroad integration not found'
      , 404)
    }

    // Validate integration status
    if (integration.status !== 'connected') {
      logger.error('❌ [Gumroad API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return errorResponse('Gumroad integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = gumroadHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Gumroad API] Unknown data type:', dataType)
      return jsonResponse({
        error: `Unknown Gumroad data type: ${dataType}`,
        availableTypes: Object.keys(gumroadHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [Gumroad API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const data = await handler(integration as GumroadIntegration, options)

    logger.debug(`✅ [Gumroad API] Successfully processed ${dataType}:`, {
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
    logger.error('❌ [Gumroad API] Unexpected error:', {
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
      return errorResponse('Gumroad API rate limit exceeded. Please try again later.', 429, { retryAfter: 60
       })
    }

    return errorResponse(error.message || 'Internal server error', 500, { details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     })
  }
}