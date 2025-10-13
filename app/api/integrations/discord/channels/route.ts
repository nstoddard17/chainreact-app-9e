/**
 * Discord Channels API Endpoint
 * GET /api/integrations/discord/channels
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { getDiscordChannels } from '../data/handlers/channels'
import { DiscordIntegration } from '../data/types'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const guildId = searchParams.get('guildId')
    const userId = searchParams.get('userId')
    const channelTypes = searchParams.get('channelTypes')
    const nameFilter = searchParams.get('nameFilter')
    const sortBy = searchParams.get('sortBy') || 'position'
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const parentCategory = searchParams.get('parentCategory')
    const context = searchParams.get('context')

    // Validate required parameters
    if (!guildId || !userId) {
      return errorResponse('Missing required parameters: guildId and userId'
      , 400)
    }

    // Find Discord integration for this user
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'discord')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Discord Channels] Integration not found:', { userId, error: integrationError })
      return errorResponse('Discord integration not found'
      , 404)
    }

    // Validate integration status
    if (integration.status !== 'connected' && integration.status !== 'active') {
      logger.error('❌ [Discord Channels] Integration not connected:', {
        userId,
        status: integration.status
      })
      return errorResponse('Discord integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    logger.debug(`🔍 [Discord Channels] Processing request:`, {
      userId,
      guildId,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Build options for the handler
    const options = {
      guildId,
      channelTypes: channelTypes ? channelTypes.split(',') : undefined,
      nameFilter,
      sortBy,
      includeArchived,
      parentCategory,
      context
    }

    // Get channels using the handler
    const channels = await getDiscordChannels(integration as DiscordIntegration, options)

    logger.debug(`✅ [Discord Channels] Successfully fetched channels:`, {
      userId,
      guildId,
      channelCount: channels?.length || 0
    })

    return jsonResponse({
      data: channels,
      success: true,
      guildId,
      userId
    })

  } catch (error: any) {
    logger.error('❌ [Discord Channels] Unexpected error:', {
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
      return errorResponse('Discord API rate limit exceeded. Please try again later.', 429, { retryAfter: 60
       })
    }

    return errorResponse(error.message || 'Internal server error', 500, { details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     })
  }
}