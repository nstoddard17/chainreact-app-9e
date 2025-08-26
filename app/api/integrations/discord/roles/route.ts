/**
 * Discord Roles API Endpoint
 * GET /api/integrations/discord/roles
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from "@supabase/supabase-js"
import { getDiscordRoles } from '../data/handlers/roles'
import { DiscordIntegration } from '../data/types'

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
      return NextResponse.json({
        error: 'Missing required parameters: guildId and userId'
      }, { status: 400 })
    }

    // Find Discord integration for this user
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'discord')
      .single()

    if (integrationError || !integration) {
      console.error('❌ [Discord Roles] Integration not found:', { userId, error: integrationError })
      return NextResponse.json({
        error: 'Discord integration not found'
      }, { status: 404 })
    }

    // Validate integration status
    if (integration.status !== 'connected' && integration.status !== 'active') {
      console.error('❌ [Discord Roles] Integration not connected:', {
        userId,
        status: integration.status
      })
      return NextResponse.json({
        error: 'Discord integration is not connected. Please reconnect your account.',
        needsReconnection: true,
        currentStatus: integration.status
      }, { status: 400 })
    }

    console.log(`🔍 [Discord Roles] Processing request:`, {
      userId,
      guildId,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Get roles using the handler
    const roles = await getDiscordRoles(integration as DiscordIntegration, { guildId })

    console.log(`✅ [Discord Roles] Successfully fetched roles:`, {
      userId,
      guildId,
      roleCount: roles?.length || 0
    })

    return NextResponse.json({
      data: roles,
      success: true,
      guildId,
      userId
    })

  } catch (error: any) {
    console.error('❌ [Discord Roles] Unexpected error:', {
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
        error: 'Discord API rate limit exceeded. Please try again later.',
        retryAfter: 60
      }, { status: 429 })
    }

    return NextResponse.json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}