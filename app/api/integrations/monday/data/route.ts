/**
 * Monday.com Data API Route
 * Handles all Monday.com-specific data fetching operations
 */

import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { mondayHandlers, isMondayDataTypeSupported, getAvailableMondayDataTypes } from './handlers'
import { MondayIntegration } from './types'
import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SECRET_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Handle Monday.com data requests
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { integrationId, dataType, options = {} } = body

    logger.debug('🔍 [Monday Data API] Request:', { integrationId, dataType, options })

    // Validate required parameters
    if (!integrationId || !dataType) {
      logger.debug('❌ [Monday Data API] Missing required parameters')
      return errorResponse('Missing required parameters: integrationId and dataType', 400)
    }

    // Check if data type is supported
    if (!isMondayDataTypeSupported(dataType)) {
      logger.debug('❌ [Monday Data API] Unsupported data type:', dataType)
      return jsonResponse({
        error: `Data type '${dataType}' not supported. Available types: ${getAvailableMondayDataTypes().join(', ')}`
      }, { status: 400 })
    }

    // Get Monday.com integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'monday')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Monday Data API] Integration not found:', integrationError)
      return errorResponse('Monday.com integration not found', 404)
    }

    // Validate integration status
    if (integration.status !== 'connected' && integration.status !== 'active') {
      logger.debug('⚠️ [Monday Data API] Integration not connected:', integration.status)
      return errorResponse('Monday.com integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = mondayHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Monday Data API] Handler not found for:', dataType)
      return jsonResponse({ error: `Handler not implemented for data type: ${dataType}` }, { status: 500 })
    }

    // Execute the handler
    logger.debug(`🚀 [Monday Data API] Executing handler for: ${dataType}`)
    const startTime = Date.now()

    const result = await handler(integration as MondayIntegration, options)

    const duration = Date.now() - startTime
    logger.debug(`✅ [Monday Data API] Handler completed in ${duration}ms, returned ${Array.isArray(result) ? result.length : 'non-array'} items`)

    return jsonResponse({
      data: result,
      meta: {
        dataType,
        integrationId,
        count: Array.isArray(result) ? result.length : 1,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error: any) {
    logger.error('❌ [Monday Data API] Error:', {
      message: error.message,
      status: error.status,
      stack: error.stack
    })

    // Handle specific Monday.com API errors
    if (error.status === 401) {
      return errorResponse('Monday.com authentication expired. Please reconnect your account.', 401, {
        needsReconnection: true
      })
    }

    if (error.status === 403) {
      return errorResponse('Monday.com API access forbidden. Check your permissions.', 403, {
        needsReconnection: true
      })
    }

    if (error.status === 429) {
      return errorResponse('Monday.com API rate limit exceeded. Please try again later.', 429)
    }

    return errorResponse(error.message || 'Internal server error', 500, {
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

/**
 * Get available Monday.com data types
 */
export async function GET() {
  return jsonResponse({
    availableDataTypes: getAvailableMondayDataTypes(),
    description: 'Monday.com Integration Data API',
    version: '1.0.0'
  })
}
