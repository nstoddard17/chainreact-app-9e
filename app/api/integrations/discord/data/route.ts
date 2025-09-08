/**
 * Discord Integration Data API Route
 * Handles Discord data requests with rate limiting and proper error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from "@supabase/supabase-js"
import { discordHandlers } from './handlers'
import { DiscordIntegration } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

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
      .eq('provider', 'discord')
      .single()

    if (integrationError || !integration) {
      console.error('❌ [Discord API] Integration not found:', { integrationId, error: integrationError })
      return NextResponse.json({
        error: 'Discord integration not found'
      }, { status: 404 })
    }

    // Validate integration status - check for re-authorization needed
    if (integration.status === 'needs_reauthorization') {
      console.error('❌ [Discord API] Integration needs re-authorization:', {
        integrationId,
        status: integration.status
      })
      return NextResponse.json({
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
      console.error('❌ [Discord API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return NextResponse.json({
        data: [],
        success: false,
        error: 'Discord integration is not connected. Please reconnect your account.',
        needsReconnection: true,
        currentStatus: integration.status
      })
    }
    
    // Log warning for non-standard statuses but continue
    if (integration.status !== 'connected' && integration.status !== 'active') {
      console.warn('⚠️ [Discord API] Non-standard integration status, continuing anyway:', {
        integrationId,
        status: integration.status
      })
    }

    // Get the appropriate handler
    const handler = discordHandlers[dataType]
    if (!handler) {
      console.error('❌ [Discord API] Unknown data type:', dataType, 'Available:', Object.keys(discordHandlers))
      return NextResponse.json({
        error: `Unknown Discord data type: ${dataType}`,
        availableTypes: Object.keys(discordHandlers)
      }, { status: 400 })
    }

    console.log(`🔍 [Discord API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const data = await handler(integration as DiscordIntegration, options)

    console.log(`✅ [Discord API] Successfully processed ${dataType}:`, {
      integrationId,
      resultCount: data?.length || 0
    })

    return NextResponse.json({
      data,
      success: true,
      integrationId,
      dataType
    })

  } catch (error: any) {
    console.error('❌ [Discord API] Unexpected error:', {
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