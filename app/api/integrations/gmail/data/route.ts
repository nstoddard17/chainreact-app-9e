/**
 * Gmail Data API Route
 * Handles all Gmail-specific data fetching operations
 */

import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { gmailHandlers, isGmailDataTypeSupported, getAvailableGmailDataTypes } from './handlers'
import { GmailIntegration } from './types'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SECRET_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Request deduplication cache
 * Prevents duplicate API calls within a short time window
 */
interface CachedRequest {
  promise: Promise<any>
  timestamp: number
  result?: any
}

const requestCache = new Map<string, CachedRequest>()
const DEDUP_WINDOW_MS = 2000 // Deduplicate requests within 2 seconds
const CACHE_RESULT_TTL_MS = 5000 // Cache successful results for 5 seconds

// Cleanup old cache entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, cached] of requestCache.entries()) {
    if (now - cached.timestamp > CACHE_RESULT_TTL_MS) {
      requestCache.delete(key)
    }
  }
}, 10000) // Cleanup every 10 seconds

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

    // Request deduplication: Check if we have a recent identical request
    const cacheKey = `${integrationId}:${dataType}:${JSON.stringify(options)}`
    const now = Date.now()
    const cached = requestCache.get(cacheKey)

    if (cached) {
      // If we have a cached result and it's still fresh, return it
      if (cached.result && (now - cached.timestamp) < CACHE_RESULT_TTL_MS) {
        logger.debug(`⚡ [Gmail Data API] Returning cached result for: ${dataType}`)
        return jsonResponse({
          data: cached.result,
          meta: {
            dataType,
            integrationId,
            count: Array.isArray(cached.result) ? cached.result.length : 1,
            cached: true,
            timestamp: new Date().toISOString()
          }
        })
      }

      // If there's a request in flight within the dedup window, wait for it
      if ((now - cached.timestamp) < DEDUP_WINDOW_MS) {
        logger.debug(`⏳ [Gmail Data API] Waiting for in-flight request: ${dataType}`)
        try {
          const result = await cached.promise
          return jsonResponse({
            data: result,
            meta: {
              dataType,
              integrationId,
              count: Array.isArray(result) ? result.length : 1,
              deduplicated: true,
              timestamp: new Date().toISOString()
            }
          })
        } catch (error) {
          // If the previous request failed, continue with a new request
          logger.debug(`⚠️ [Gmail Data API] Previous request failed, making new request: ${dataType}`)
        }
      }
    }

    // Try to get Gmail integration by the provided ID first
    let integrationQuery = supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'gmail')
      .single()

    let { data: integration, error: integrationError } = await integrationQuery

    // If not found and this is a cross-provider request (e.g., gmail-contacts from Google Drive),
    // find the user's Gmail integration by user_id
    if (integrationError || !integration) {
      logger.debug('🔍 [Gmail Data API] Gmail integration not found by ID, trying to find by user_id...')

      // First get the original integration to find the user_id
      const { data: originalIntegration } = await supabase
        .from('integrations')
        .select('user_id')
        .eq('id', integrationId)
        .single()

      if (originalIntegration?.user_id) {
        // Find user's Gmail integration
        const { data: gmailIntegration, error: gmailError } = await supabase
          .from('integrations')
          .select('*')
          .eq('user_id', originalIntegration.user_id)
          .eq('provider', 'gmail')
          .eq('status', 'connected')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (gmailIntegration) {
          logger.debug('✅ [Gmail Data API] Found Gmail integration for user:', { userId: originalIntegration.user_id })
          integration = gmailIntegration
          integrationError = null
        } else {
          logger.debug('❌ [Gmail Data API] No Gmail integration found for user')
          return errorResponse('Gmail integration not found. Please connect your Gmail account first.', 404, {
            needsConnection: true,
            provider: 'gmail'
          })
        }
      } else {
        logger.error('❌ [Gmail Data API] Integration not found:', integrationError)
        return errorResponse('Gmail integration not found' , 404)
      }
    }

    if (!integration) {
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

    // Execute the handler with caching
    logger.debug(`🚀 [Gmail Data API] Executing handler for: ${dataType}`)
    const startTime = Date.now()

    // Create a promise for the handler execution
    const handlerPromise = handler(integration as GmailIntegration, options)

    // Store the promise in the cache immediately (before awaiting)
    requestCache.set(cacheKey, {
      promise: handlerPromise,
      timestamp: Date.now()
    })

    const result = await handlerPromise

    // Update cache with the result
    const cachedEntry = requestCache.get(cacheKey)
    if (cachedEntry) {
      cachedEntry.result = result
    }

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