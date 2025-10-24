/**
 * Google Analytics Data API Route
 * Handles all Google Analytics-specific data fetching operations
 */

import { type NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { googleAnalyticsHandlers, isGoogleAnalyticsDataTypeSupported, getAvailableGoogleAnalyticsDataTypes } from './handlers'
import { GoogleAnalyticsIntegration } from './types'
import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Handle Google Analytics data requests
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { integrationId, dataType, options = {} } = body

    logger.debug('🔍 [Google Analytics Data API] Request:', { integrationId, dataType, options })

    // Validate required parameters
    if (!integrationId || !dataType) {
      logger.debug('❌ [Google Analytics Data API] Missing required parameters')
      return errorResponse('Missing required parameters: integrationId and dataType', 400)
    }

    // Check if data type is supported
    if (!isGoogleAnalyticsDataTypeSupported(dataType)) {
      logger.debug('❌ [Google Analytics Data API] Unsupported data type:', dataType)
      return jsonResponse(
        {
          error: `Data type '${dataType}' not supported. Available types: ${getAvailableGoogleAnalyticsDataTypes().join(', ')}`
        },
        { status: 400 }
      )
    }

    // Get Google Analytics integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'google-analytics')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Google Analytics Data API] Integration not found:', integrationError)
      return errorResponse('Google Analytics integration not found', 404)
    }

    // Validate integration status
    if (integration.status !== 'connected' && integration.status !== 'active') {
      logger.debug('⚠️ [Google Analytics Data API] Integration not connected:', integration.status)
      return errorResponse('Google Analytics integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = googleAnalyticsHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Google Analytics Data API] Handler not found for:', dataType)
      return jsonResponse({ error: `Handler not implemented for data type: ${dataType}` }, { status: 500 })
    }

    // Execute the handler
    logger.debug(`🚀 [Google Analytics Data API] Executing handler for: ${dataType}`)
    const startTime = Date.now()

    const result = await handler(integration as GoogleAnalyticsIntegration, options)

    const duration = Date.now() - startTime
    logger.debug(
      `✅ [Google Analytics Data API] Handler completed in ${duration}ms, returned ${
        Array.isArray(result) ? result.length : 'non-array'
      } items`
    )

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
    logger.error('❌ [Google Analytics Data API] Error:', error)

    // Handle specific Google Analytics API errors
    if (error.code === 401 || error.message?.includes('authentication')) {
      return errorResponse('Google Analytics authentication expired. Please reconnect your account.', 401, {
        needsReconnection: true
      })
    }

    if (error.code === 403 || error.message?.includes('permission')) {
      return errorResponse('Google Analytics API access forbidden. Check your permissions.', 403, {
        needsReconnection: true
      })
    }

    if (error.code === 429 || error.message?.includes('rate limit')) {
      return errorResponse('Google Analytics API rate limit exceeded. Please try again later.', 429)
    }

    return errorResponse(error.message || 'Internal server error', 500, {
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

/**
 * Get available Google Analytics data types
 */
export async function GET() {
  return jsonResponse({
    availableDataTypes: getAvailableGoogleAnalyticsDataTypes(),
    description: 'Google Analytics Integration Data API',
    version: '1.0.0'
  })
}
