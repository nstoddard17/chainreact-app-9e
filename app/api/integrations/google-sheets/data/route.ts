/**
 * Google Sheets Integration Data API Route
 * Handles Google Sheets data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { googleSheetsHandlers } from './handlers'
import { GoogleSheetsIntegration } from './types'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SECRET_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    const { integrationId, dataType, options = {} } = await req.json()

    // Validate required parameters
    if (!integrationId || !dataType) {
      return errorResponse('Missing required parameters: integrationId and dataType'
      , 400)
    }

    // Fetch integration from database - Google Sheets is stored with various provider names
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Google Sheets API] Integration not found:', { integrationId, error: integrationError })
      return errorResponse('Google Sheets integration not found'
      , 404)
    }

    // Validate integration status
    if (integration.status !== 'connected') {
      logger.error('❌ [Google Sheets API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return errorResponse('Google Sheets integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = googleSheetsHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Google Sheets API] Unknown data type:', dataType)
      return jsonResponse({
        error: `Unknown Google Sheets data type: ${dataType}`,
        availableTypes: Object.keys(googleSheetsHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [Google Sheets API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const data = await handler(integration as GoogleSheetsIntegration, options)

    logger.debug(`✅ [Google Sheets API] Successfully processed ${dataType}:`, {
      integrationId,
      resultCount: Array.isArray(data) ? data.length : 1
    })

    return jsonResponse({
      data,
      success: true,
      integrationId,
      dataType
    })

  } catch (error: any) {
    logger.error('❌ [Google Sheets API] Unexpected error:', {
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
      return errorResponse('API rate limit exceeded. Please try again in a few moments.', 429, { rateLimited: true
       })
    }

    return errorResponse(error.message || 'An unexpected error occurred', 500, { details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     })
  }
}