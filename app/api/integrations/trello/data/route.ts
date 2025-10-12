/**
 * Trello Integration Data API Route
 * Handles Trello data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from "@supabase/supabase-js"
import { trelloHandlers } from './handlers'
import { clearIntegrationWorkflowFlags } from '@/lib/integrations/integrationWorkflowManager'
import { TrelloIntegration } from './types'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

// Request deduplication cache
const activeRequests = new Map<string, Promise<any>>()
const requestResults = new Map<string, { data: any, timestamp: number }>()
const CACHE_TTL = 5000 // 5 seconds cache for identical requests

export async function POST(req: NextRequest) {
  try {
    const { integrationId, dataType, options = {} } = await req.json()

    // Validate required parameters
    if (!integrationId || !dataType) {
      return NextResponse.json({
        error: 'Missing required parameters: integrationId and dataType'
      }, { status: 400 })
    }

    // Fetch integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'trello')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Trello API] Integration not found:', { integrationId, error: integrationError })
      return NextResponse.json({
        error: 'Trello integration not found'
      }, { status: 404 })
    }

    // Validate integration status
    if (integration.status !== 'connected') {
      logger.error('❌ [Trello API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return NextResponse.json({
        error: 'Trello integration is not connected. Please reconnect your account.',
        needsReconnection: true,
        currentStatus: integration.status
      }, { status: 400 })
    }

    // Get the appropriate handler
    const handler = trelloHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Trello API] Unknown data type:', dataType)
      return NextResponse.json({
        error: `Unknown Trello data type: ${dataType}`,
        availableTypes: Object.keys(trelloHandlers)
      }, { status: 400 })
    }

    // Create a request key for deduplication
    const requestKey = `${integrationId}-${dataType}-${JSON.stringify(options)}`

    // Check if we have a recent cached result
    const cachedResult = requestResults.get(requestKey)
    if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL) {
      logger.debug(`✨ [Trello API] Using cached result for ${dataType}`)
      return NextResponse.json({
        data: cachedResult.data,
        success: true,
        integrationId,
        dataType,
        cached: true
      })
    }

    // Check if there's already an active request for this exact same data
    const activeRequest = activeRequests.get(requestKey)
    if (activeRequest) {
      logger.debug(`⏳ [Trello API] Waiting for existing request: ${dataType}`)
      try {
        const data = await activeRequest
        return NextResponse.json({
          data,
          success: true,
          integrationId,
          dataType,
          deduplicated: true
        })
      } catch (error) {
        // If the active request failed, we'll try again below
        activeRequests.delete(requestKey)
      }
    }

    logger.debug(`🔍 [Trello API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Create a new request promise and store it for deduplication
    const requestPromise = handler(integration as TrelloIntegration, options)
    activeRequests.set(requestKey, requestPromise)

    try {
      // Execute the handler
      const data = await requestPromise

      // Cache the successful result
      requestResults.set(requestKey, {
        data,
        timestamp: Date.now()
      })

      // Clean up old cache entries periodically
      if (requestResults.size > 100) {
        const now = Date.now()
        for (const [key, value] of requestResults.entries()) {
          if (now - value.timestamp > CACHE_TTL * 2) {
            requestResults.delete(key)
          }
        }
      }

      logger.debug(`✅ [Trello API] Successfully processed ${dataType}:`, {
        integrationId,
        resultCount: data?.length || 0
      })

      if (integration.status !== 'connected') {
        try {
          await clearIntegrationWorkflowFlags({ integrationId: integration.id, provider: 'trello', userId: integration.user_id })
        } catch (clearError) {
          logger.warn('⚠️ [Trello API] Failed to clear reconnect flag after successful data load:', clearError)
        }
      }

      return NextResponse.json({
        data,
        success: true,
        integrationId,
        dataType
      })
    } finally {
      // Always clean up the active request
      activeRequests.delete(requestKey)
    }

  } catch (error: any) {
    logger.error('❌ [Trello API] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })

    // Handle authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      return NextResponse.json({
        error: error.message,
        needsReconnection: true
      }, { status: 401 })
    }

    // Handle rate limit errors
    if (error.message?.includes('rate limit')) {
      return NextResponse.json({
        error: 'Trello API rate limit exceeded. Please try again later.',
        retryAfter: 60
      }, { status: 429 })
    }

    return NextResponse.json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}