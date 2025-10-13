/**
 * Gmail Data API Route
 * Handles all Gmail-specific data fetching operations
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { gmailHandlers, isGmailDataTypeSupported, getAvailableGmailDataTypes } from './handlers'
import { GmailIntegration } from './types'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Handle Gmail data requests
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { integrationId, dataType, options = {} } = body

    logger.debug('🔍 [Gmail Data API] Request:', { integrationId, dataType, options })

    // Validate required parameters
    if (!integrationId || !dataType) {
      logger.debug('❌ [Gmail Data API] Missing required parameters')
      return errorResponse('Missing required parameters: integrationId and dataType' , 400)
    }

    // Check if data type is supported
    if (!isGmailDataTypeSupported(dataType)) {
      logger.debug('❌ [Gmail Data API] Unsupported data type:', dataType)
      return jsonResponse({ 
        error: `Data type '${dataType}' not supported. Available types: ${getAvailableGmailDataTypes().join(', ')}` 
      }, { status: 400 })
    }

    // Get Gmail integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'gmail')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Gmail Data API] Integration not found:', integrationError)
      return errorResponse('Gmail integration not found' , 404)
    }

    // Validate integration status - allow 'connected' status
    if (integration.status !== 'connected' && integration.status !== 'active') {
      logger.debug('⚠️ [Gmail Data API] Integration not connected:', integration.status)
      return errorResponse('Gmail integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = gmailHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Gmail Data API] Handler not found for:', dataType)
      return jsonResponse({ error: `Handler not implemented for data type: ${dataType}` }, { status: 500 })
    }

    // Execute the handler
    logger.debug(`🚀 [Gmail Data API] Executing handler for: ${dataType}`)
    const startTime = Date.now()
    
    const result = await handler(integration as GmailIntegration, options)
    
    const duration = Date.now() - startTime
    logger.debug(`✅ [Gmail Data API] Handler completed in ${duration}ms, returned ${Array.isArray(result) ? result.length : 'non-array'} items`)

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
    logger.error('❌ [Gmail Data API] Error:', error)
    
    // Handle specific Gmail API errors
    if (error.status === 401) {
      return errorResponse('Gmail authentication expired. Please reconnect your account.', 401, { needsReconnection: true 
       })
    }
    
    if (error.status === 403) {
      return errorResponse('Gmail API access forbidden. Check your permissions.', 403, { needsReconnection: true 
       })
    }
    
    if (error.status === 429) {
      return errorResponse('Gmail API rate limit exceeded. Please try again later.' 
      , 429)
    }

    return errorResponse(error.message || 'Internal server error', 500, { details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     })
  }
}

/**
 * Get available Gmail data types
 */
export async function GET() {
  return jsonResponse({
    availableDataTypes: getAvailableGmailDataTypes(),
    description: 'Gmail Integration Data API',
    version: '1.0.0'
  })
}