/**
 * Google Integration Data API Route
 * Handles all Google data requests with proper validation and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from "@supabase/supabase-js"
import { googleHandlers } from './handlers'
import { GoogleIntegration } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    const requestBody = await req.json()
    const { integrationId, dataType, options = {} } = requestBody

    console.log(`🔍 [Google Data API] Request received:`, {
      integrationId,
      dataType,
      options,
      fullRequestBody: requestBody
    })

    // Validate required parameters
    if (!integrationId || !dataType) {
      console.error(`❌ [Google Data API] Missing required parameters:`, {
        integrationId,
        dataType
      })
      return NextResponse.json({
        error: 'Missing required parameters: integrationId and dataType'
      }, { status: 400 })
    }

    // Fetch integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single()

    if (integrationError || !integration) {
      console.error('❌ [Google API] Integration not found:', { integrationId, error: integrationError })
      return NextResponse.json({
        error: 'Google integration not found'
      }, { status: 404 })
    }

    // Log the actual provider for debugging
    console.log('📊 [Google API] Integration provider check:', {
      integrationId,
      actualProvider: integration.provider,
      dataType,
      providerLowerCase: integration.provider?.toLowerCase()
    });

    // Validate that this is a Google integration
    // Accept any integration for Google services since they share OAuth
    const validProviders = [
      'google',
      'google-calendar',
      'google-drive',
      'google-sheets',
      'google-docs',
      'google_calendar',
      'gmail', // Gmail uses same Google OAuth
      'youtube' // YouTube might also use Google OAuth
    ];

    // Also check if it's a unified Google integration by checking scopes
    const hasGoogleScopes = integration.scopes?.some((scope: string) =>
      scope.includes('googleapis.com') || scope.includes('google.com')
    );

    const isValidProvider = validProviders.some(prefix =>
      integration.provider?.toLowerCase().startsWith(prefix.toLowerCase())
    ) || hasGoogleScopes;

    if (!isValidProvider) {
      console.error('❌ [Google API] Invalid provider:', {
        integrationId,
        provider: integration.provider,
        scopes: integration.scopes,
        validProviders,
        hasGoogleScopes
      })
      return NextResponse.json({
        error: `Invalid integration provider. Expected Google-related provider but got: ${integration.provider}`,
        actualProvider: integration.provider
      }, { status: 400 })
    }

    // Validate integration status - allow both 'connected' and 'active' status
    if (integration.status !== 'connected' && integration.status !== 'active') {
      console.error('❌ [Google API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return NextResponse.json({
        error: 'Google integration is not connected. Please reconnect your account.',
        needsReconnection: true,
        currentStatus: integration.status
      }, { status: 400 })
    }

    // Get the appropriate handler
    const handler = googleHandlers[dataType]
    if (!handler) {
      console.error('❌ [Google API] Unknown data type:', dataType)
      return NextResponse.json({
        error: `Unknown Google data type: ${dataType}`,
        availableTypes: Object.keys(googleHandlers)
      }, { status: 400 })
    }

    console.log(`🔍 [Google API] Processing request:`, {
      integrationId,
      dataType,
      provider: integration.provider,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const data = await handler(integration as GoogleIntegration, options)

    console.log(`✅ [Google API] Successfully processed ${dataType}:`, {
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
    console.error('❌ [Google API] Unexpected error:', {
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
    if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
      return NextResponse.json({
        error: 'Google API rate limit exceeded. Please try again later.',
        retryAfter: 60
      }, { status: 429 })
    }

    return NextResponse.json({
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}