/**
 * Discord Members API Endpoint
 * GET /api/integrations/discord/members
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { getDiscordMembers } from '../data/handlers/members'
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
      logger.error('❌ [Discord Members] Integration not found:', { userId, error: integrationError })
      return errorResponse('Discord integration not found'
      , 404)
    }

    // Validate integration status
    if (integration.status !== 'connected' && integration.status !== 'active') {
      logger.error('❌ [Discord Members] Integration not connected:', {
        userId,
        status: integration.status
      })
      return errorResponse('Discord integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    logger.debug(`🔍 [Discord Members] Processing request:`, {
      userId,
      guildId,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Get members using the handler
    const members = await getDiscordMembers(integration as DiscordIntegration, { guildId })

    logger.debug(`✅ [Discord Members] Successfully fetched members:`, {
      userId,
      guildId,
      memberCount: members?.length || 0
    })

    return jsonResponse({
      data: members,
      success: true,
      guildId,
      userId
    })

  } catch (error: any) {
    logger.error('❌ [Discord Members] Unexpected error:', {
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