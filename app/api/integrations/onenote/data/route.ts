/**
 * OneNote Integration Data API Route
 * Handles OneNote data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from "@supabase/supabase-js"
import { oneNoteHandlers } from './handlers'
import { OneNoteIntegration } from './types'

import { logger } from '@/lib/utils/logger'

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

    logger.debug(`🔍 [OneNote API] Looking for integration:`, {
      integrationId,
      dataType,
      options
    })

    // Fetch integration from database
    // First try to find by ID alone, then check provider
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [OneNote API] Integration not found:', { integrationId, error: integrationError })
      return NextResponse.json({
        error: 'OneNote integration not found'
      }, { status: 404 })
    }

    // Validate it's a OneNote/Microsoft integration
    const validProviders = ['onenote', 'microsoft-onenote', 'microsoft-outlook', 'outlook'];
    if (!validProviders.includes(integration.provider?.toLowerCase())) {
      logger.error('❌ [OneNote API] Invalid provider:', {
        integrationId,
        actualProvider: integration.provider,
        expectedProviders: validProviders
      })
      return NextResponse.json({
        error: `Invalid integration provider. Expected OneNote/Microsoft integration but got: ${integration.provider}`
      }, { status: 400 })
    }

    logger.debug(`✅ [OneNote API] Found integration with provider: ${integration.provider}`)

    // Validate integration status - accept both 'connected' and 'active'
    if (integration.status !== 'connected' && integration.status !== 'active') {
      logger.error('❌ [OneNote API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return NextResponse.json({
        error: 'OneNote integration is not connected. Please reconnect your Microsoft account.',
        needsReconnection: true,
        currentStatus: integration.status
      }, { status: 400 })
    }
    
    // Check for personal account limitation
    if (integration.metadata?.accountType === 'personal') {
      logger.warn('⚠️ [OneNote API] Personal account detected with known limitations:', {
        integrationId,
        email: integration.metadata.email
      })
      
      // Return a special response for personal accounts
      return NextResponse.json({
        data: [],
        warning: 'OneNote API does not work with personal Microsoft accounts (outlook.com, hotmail.com, live.com). Please use a work or school account for OneNote integration.',
        accountType: 'personal',
        email: integration.metadata.email,
        knownLimitation: true,
        suggestedActions: [
          'Use a Microsoft work or school account',
          'Create a free Microsoft 365 developer account for testing',
          'Contact your IT administrator if you have a work account'
        ]
      })
    }

    // Get the appropriate handler
    const handler = oneNoteHandlers[dataType]
    if (!handler) {
      logger.error('❌ [OneNote API] Unknown data type:', dataType)
      return NextResponse.json({
        error: `Unknown OneNote data type: ${dataType}`,
        availableTypes: Object.keys(oneNoteHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [OneNote API] Processing request:`, {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const result = await handler(integration as OneNoteIntegration, options)

    logger.debug(`✅ [OneNote API] Successfully processed ${dataType}:`, {
      integrationId,
      resultCount: result.data?.length || 0,
      hasError: !!result.error
    })

    return NextResponse.json({
      data: result.data,
      error: result.error,
      success: !result.error,
      integrationId,
      dataType
    })

  } catch (error: any) {
    logger.error('❌ [OneNote API] Unexpected error:', {
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
        error: 'Microsoft Graph API rate limit exceeded. Please try again later.',
        retryAfter: 60
      }, { status: 429 })
    }

    return NextResponse.json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}