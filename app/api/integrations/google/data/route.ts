/**
 * Google Integration Data API Route
 * Handles all Google data requests with proper validation and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { googleHandlers } from './handlers'
import { GoogleIntegration } from './types'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  try {
    const requestBody = await req.json()
    const { integrationId, dataType, options = {} } = requestBody

    logger.debug(`🔍 [Google Data API] Request received:`, {
      integrationId,
      dataType,
      options,
      fullRequestBody: requestBody
    })

    // Validate required parameters
    if (!integrationId || !dataType) {
      logger.error(`❌ [Google Data API] Missing required parameters:`, {
        integrationId,
        dataType
      })
      return errorResponse('Missing required parameters: integrationId and dataType'
      , 400)
    }

    // Fetch integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single()

    if (integrationError || !integration) {
      logger.error('❌ [Google API] Integration not found:', { integrationId, error: integrationError })
      return errorResponse('Google integration not found'
      , 404)
    }

    // Log the actual provider for debugging
    logger.debug('📊 [Google API] Integration provider check:', {
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
      logger.error('❌ [Google API] Invalid provider:', {
        integrationId,
        provider: integration.provider,
        scopes: integration.scopes,
        validProviders,
        hasGoogleScopes
      })
      return jsonResponse({
        error: `Invalid integration provider. Expected Google-related provider but got: ${integration.provider}`,
        actualProvider: integration.provider
      }, { status: 400 })
    }

    // Validate integration status - allow both 'connected' and 'active' status
    if (integration.status !== 'connected' && integration.status !== 'active') {
      logger.error('❌ [Google API] Integration not connected:', {
        integrationId,
        status: integration.status
      })
      return errorResponse('Google integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = googleHandlers[dataType]
    if (!handler) {
      logger.error('❌ [Google API] Unknown data type:', dataType)
      return jsonResponse({
        error: `Unknown Google data type: ${dataType}`,
        availableTypes: Object.keys(googleHandlers)
      }, { status: 400 })
    }

    logger.debug(`🔍 [Google API] Processing request:`, {
      integrationId,
      dataType,
      provider: integration.provider,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Execute the handler
    const data = await handler(integration as GoogleIntegration, options)

    logger.debug(`✅ [Google API] Successfully processed ${dataType}:`, {
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
    logger.error('❌ [Google API] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })

    // Handle authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      return errorResponse(error.message, 401, { needsReconnection: true
       })
    }

    // Handle rate limit errors
    if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
      return errorResponse('Google API rate limit exceeded. Please try again later.', 429, { retryAfter: 60
       })
    }

    return errorResponse(error.message || 'Internal server error', 500, { details: process.env.NODE_ENV === 'development' ? error.stack : undefined
     })
  }
}