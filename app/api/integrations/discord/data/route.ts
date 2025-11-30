/**
 * Discord Integration Data API Route
 * Handles Discord data requests with rate limiting and proper error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { discordHandlers } from './handlers'
import { DiscordIntegration } from './types'

import { logger } from '@/lib/utils/logger'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { integrationId, dataType, options = {} } = await req.json()

    // Validate required parameters
    if (!integrationId || !dataType) {
      return errorResponse('Missing required parameters: integrationId and dataType'
      , 400)
    }

    // Fetch integration from database
    const { data: integration, error: integrationError } = await getSupabase()
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'discord')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Discord API] Integration not found:', { integrationId, error: integrationError })
      return errorResponse('Discord integration not found'
      , 404)
    }

    // Validate integration status - check for re-authorization needed
    if (integration.status === 'needs_reauthorization') {
      logger.error('❌ [Discord API] Integration needs re-authorization:', {
        integrationId,
        status: integration.status
      })
      return jsonResponse({
        data: [],
        success: false,
        error: 'Discord integration needs to be re-authorized. Please reconnect your Discord account.',
        needsReconnection: true,
        currentStatus: integration.status
      })
    }
    
    // Check for other invalid statuses - be more lenient
    // Only fail if status is explicitly disconnected or error
    if (integration.status === 'disconnected' || integration.status === 'error') {
      logger.error('❌ [Discord API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return jsonResponse({
        data: [],
        success: false,
        error: 'Discord integration is not connected. Please reconnect your account.',
        needsReconnection: true,
        currentStatus: integration.status
      })
    }
    
    // Log warning for non-standard statuses but continue
    if (integration.status !== 'connected' && integration.status !== 'active') {
      logger.warn('⚠️ [Discord API] Non-standard integration status, continuing anyway:', {
        integrationId,
        status: integration.status
      })
    }

    // Get the appropriate handler
    const handler = discordHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Discord API] Unknown data type:', dataType, 'Available:', Object.keys(discordHandlers))
      return jsonResponse({
        error: `Unknown Discord data type: ${dataType}`,
        availableTypes: Object.keys(discordHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [Discord API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const data = await handler(integration as DiscordIntegration, options)

    logger.debug(`✅ [Discord API] Successfully processed ${dataType}:`, {
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
    logger.error('❌ [Discord API] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })

    // Handle authentication errors
    if (error.status === 401 || error.message?.includes('authentication') || error.message?.includes('expired')) {
      return errorResponse(error.message, 401, { needsReconnection: true
       })
    }

    // Handle rate limit errors gracefully for UI dropdowns
    if (error.status === 429 || error.message?.includes('rate limit')) {
      // Return empty data with success=true to avoid surfacing an error toast in UI
      // The client can re-issue later; our handlers already cache GETs for 10 minutes
      return jsonResponse({
        success: true,
        data: [],
        rateLimited: true,
        message: 'Rate limited by Discord. Showing no results temporarily.'
      })
    }

    return errorResponse(error.message || 'Internal server error', 500, { details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     })
  }
}