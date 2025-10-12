/**
 * HubSpot Integration Data API Route
 * Handles HubSpot data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from "@supabase/supabase-js"
import { hubspotHandlers } from './handlers'
import { HubSpotIntegration } from './types'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

if (!supabaseUrl || !supabaseKey) {
  logger.error('❌ [HubSpot API] Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    let integrationId, dataType, options = {}
    
    try {
      const body = await req.json()
      integrationId = body.integrationId
      dataType = body.dataType
      options = body.options || {}
      
      logger.debug('📥 [HubSpot API] Received request:', {
        integrationId,
        dataType,
        options
      })
    } catch (parseError) {
      logger.error('❌ [HubSpot API] Failed to parse request body:', parseError)
      return NextResponse.json({
        error: 'Invalid JSON in request body',
        details: parseError.message
      }, { status: 400 })
    }

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
      .eq('provider', 'hubspot')
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [HubSpot API] Integration not found:', { integrationId, error: integrationError })
      return NextResponse.json({
        error: 'HubSpot integration not found'
      }, { status: 404 })
    }

    // Validate integration status
    if (integration.status !== 'connected') {
      logger.error('❌ [HubSpot API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return NextResponse.json({
        error: 'HubSpot integration is not connected. Please reconnect your account.',
        needsReconnection: true,
        currentStatus: integration.status
      }, { status: 400 })
    }

    // Get the appropriate handler
    const handler = hubspotHandlers[dataType]
    if (!handler) {
      logger.error('❌ [HubSpot API] Unknown data type:', dataType)
      return NextResponse.json({
        error: `Unknown HubSpot data type: ${dataType}`,
        availableTypes: Object.keys(hubspotHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [HubSpot API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    let data
    try {
      data = await handler(integration as HubSpotIntegration, options)
    } catch (handlerError: any) {
      logger.error('❌ [HubSpot API] Handler execution failed:', {
        dataType,
        error: handlerError.message,
        stack: handlerError.stack,
        integrationId
      })
      
      // Return a proper error response
      return NextResponse.json({
        error: handlerError.message || 'Failed to fetch HubSpot data',
        details: process.env.NODE_ENV === 'development' ? handlerError.stack : undefined,
        needsReconnection: handlerError.message?.includes('authentication')
      }, { status: 500 })
    }

    logger.debug(`✅ [HubSpot API] Successfully processed ${dataType}:`, {
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
    logger.error('❌ [HubSpot API] Unexpected error:', {
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
        error: 'HubSpot API rate limit exceeded. Please try again later.',
        retryAfter: 60
      }, { status: 429 })
    }

    return NextResponse.json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}