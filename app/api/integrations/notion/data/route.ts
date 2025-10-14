/**
 * Notion Integration Data API Route
 * Handles basic Notion data requests (simplified version)
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { notionHandlers } from './handlers'
import { NotionIntegration } from './types'

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
      .eq('provider', 'notion')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Notion API] Integration not found:', { integrationId, error: integrationError })
      return errorResponse('Notion integration not found'
      , 404)
    }

    // Validate integration status - allow both 'connected' and 'active' status
    if (integration.status !== 'connected' && integration.status !== 'active') {
      logger.error('❌ [Notion API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return errorResponse('Notion integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = notionHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Notion API] Unknown data type:', dataType)
      return jsonResponse({
        error: `Unknown Notion data type: ${dataType}`,
        availableTypes: Object.keys(notionHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [Notion API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const data = await handler(integration as NotionIntegration, options)

    logger.debug(`✅ [Notion API] Successfully processed ${dataType}:`, {
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
    logger.error('❌ [Notion API] Unexpected error:', {
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
      return errorResponse('Notion API rate limit exceeded. Please try again later.', 429, { retryAfter: 60
       })
    }

    return errorResponse(error.message || 'Internal server error', 500, { details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     })
  }
}