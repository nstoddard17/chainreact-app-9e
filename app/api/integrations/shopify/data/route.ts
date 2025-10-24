/**
 * Shopify Data API Route
 * Handles all Shopify-specific data fetching operations
 */

import { type NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { shopifyHandlers, isShopifyDataTypeSupported, getAvailableShopifyDataTypes } from './handlers'
import { ShopifyIntegration } from './types'
import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Handle Shopify data requests
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { integrationId, dataType, options = {} } = body

    logger.debug('🔍 [Shopify Data API] Request:', { integrationId, dataType, options })

    // Validate required parameters
    if (!integrationId || !dataType) {
      logger.debug('❌ [Shopify Data API] Missing required parameters')
      return errorResponse('Missing required parameters: integrationId and dataType', 400)
    }

    // Check if data type is supported
    if (!isShopifyDataTypeSupported(dataType)) {
      logger.debug('❌ [Shopify Data API] Unsupported data type:', dataType)
      return jsonResponse(
        {
          error: `Data type '${dataType}' not supported. Available types: ${getAvailableShopifyDataTypes().join(', ')}`
        },
        { status: 400 }
      )
    }

    // Get Shopify integration from database
    const { data: integration, error: integrationError} = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'shopify')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Shopify Data API] Integration not found:', integrationError)
      return errorResponse('Shopify integration not found', 404)
    }

    // Validate integration status
    if (integration.status !== 'connected' && integration.status !== 'active') {
      logger.debug('⚠️ [Shopify Data API] Integration not connected:', integration.status)
      return errorResponse('Shopify integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = shopifyHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Shopify Data API] Handler not found for:', dataType)
      return jsonResponse({ error: `Handler not implemented for data type: ${dataType}` }, { status: 500 })
    }

    // Execute the handler
    logger.debug(`🚀 [Shopify Data API] Executing handler for: ${dataType}`)
    const startTime = Date.now()

    const result = await handler(integration as ShopifyIntegration, options)

    const duration = Date.now() - startTime
    logger.debug(
      `✅ [Shopify Data API] Handler completed in ${duration}ms, returned ${
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
    logger.error('❌ [Shopify Data API] Error:', error)

    // Handle specific Shopify API errors
    if (error.status === 401 || error.message?.includes('authentication')) {
      return errorResponse('Shopify authentication expired. Please reconnect your account.', 401, {
        needsReconnection: true
      })
    }

    if (error.status === 403 || error.message?.includes('permission')) {
      return errorResponse('Shopify API access forbidden. Check your app permissions.', 403, {
        needsReconnection: true
      })
    }

    if (error.status === 429 || error.message?.includes('rate limit')) {
      return errorResponse('Shopify API rate limit exceeded. Please try again later.', 429)
    }

    return errorResponse(error.message || 'Internal server error', 500, {
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

/**
 * Get available Shopify data types (legacy GET support)
 */
export async function GET() {
  return jsonResponse({
    availableDataTypes: getAvailableShopifyDataTypes(),
    description: 'Shopify Integration Data API',
    version: '1.0.0'
  })
}
