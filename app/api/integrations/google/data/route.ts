/**
 * Google Integration Data API Route
 * Handles all Google data requests with proper validation and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { googleHandlers } from './handlers'
import { GoogleIntegration } from './types'
import { refreshTokenForProvider } from '@/lib/integrations/tokenRefreshService'
import { encrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: NextRequest) {
  logger.debug('🚀 [Google Data API] POST handler invoked')

  try {
    let requestBody
    try {
      requestBody = await req.json()
    } catch (parseError: any) {
      logger.error('❌ [Google Data API] Failed to parse request body:', parseError)
      return errorResponse('Invalid request body - must be valid JSON', 400)
    }

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
      return errorResponse('Missing required parameters: integrationId and dataType', 400)
    }

    // Fetch integration from database
    const { data: integrationData, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single()

    if (integrationError || !integrationData) {
      logger.error('❌ [Google API] Integration not found:', { integrationId, error: integrationError })
      return errorResponse('Google integration not found'
      , 404)
    }

    // Use let so we can update it after token refresh
    let integration = integrationData

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

    // Execute the handler with automatic token refresh on 401
    let data: any
    let retryCount = 0
    const maxRetries = 1

    while (retryCount <= maxRetries) {
      try {
        data = await handler(integration as GoogleIntegration, options)
        break // Success, exit loop
      } catch (handlerError: any) {
        // Check if this is a 401 authentication error
        const is401Error = handlerError.status === 401 ||
                          handlerError.message?.includes('authentication') ||
                          handlerError.message?.includes('expired') ||
                          handlerError.message?.includes('401')

        if (is401Error && retryCount === 0 && integration.refresh_token) {
          logger.debug('🔄 [Google API] Token expired, attempting refresh...')

          // Attempt to refresh the token
          const refreshResult = await refreshTokenForProvider(
            integration.provider,
            integration.refresh_token,
            integration,
            { verbose: true }
          )

          if (refreshResult.success && refreshResult.accessToken) {
            logger.debug('✅ [Google API] Token refreshed successfully, retrying request')

            // Update the integration in database with new tokens
            const encryptionKey = process.env.ENCRYPTION_KEY!
            const updateData: any = {
              access_token: encrypt(refreshResult.accessToken, encryptionKey),
              status: 'connected',
              expires_at: refreshResult.accessTokenExpiresIn
                ? new Date(Date.now() + refreshResult.accessTokenExpiresIn * 1000).toISOString()
                : null,
              updated_at: new Date().toISOString(),
              consecutive_failures: 0,
              disconnect_reason: null
            }

            if (refreshResult.refreshToken) {
              updateData.refresh_token = encrypt(refreshResult.refreshToken, encryptionKey)
            }

            const { error: updateError } = await supabase
              .from('integrations')
              .update(updateData)
              .eq('id', integrationId)

            if (updateError) {
              logger.error('❌ [Google API] Failed to update integration with new tokens:', updateError)
            } else {
              // Fetch the updated integration
              const { data: updatedIntegration, error: fetchError } = await supabase
                .from('integrations')
                .select('*')
                .eq('id', integrationId)
                .single()

              if (fetchError || !updatedIntegration) {
                logger.error('❌ [Google API] Failed to fetch updated integration:', fetchError)
                throw handlerError
              }

              // Update integration object for retry
              integration = updatedIntegration
              retryCount++
              continue // Retry with new token
            }
          } else {
            // Token refresh failed, need reconnection
            logger.error('❌ [Google API] Token refresh failed:', refreshResult.error)
            return errorResponse(
              'Google authentication expired. Please reconnect your account.',
              401,
              {
                needsReconnection: true,
                refreshError: refreshResult.error
              }
            )
          }
        }

        // If not a 401 error, or retry failed, or no refresh token, throw the error
        throw handlerError
      }
    }

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
      error: error?.message || String(error),
      errorName: error?.name,
      errorStatus: error?.status,
      stack: error?.stack,
      errorObject: error
    })

    // Ensure we always have a valid error message
    const errorMessage = error?.message || error?.error || (typeof error === 'string' ? error : 'Unknown error occurred')

    // Handle authentication errors
    if (error.status === 401 || error?.message?.includes('authentication') || error?.message?.includes('expired')) {
      return errorResponse(
        'Google authentication expired. Please reconnect your account.',
        401,
        { needsReconnection: true }
      )
    }

    // Handle rate limit errors
    if (error?.message?.includes('rate limit') || error?.message?.includes('quota')) {
      return errorResponse('Google API rate limit exceeded. Please try again later.', 429, { retryAfter: 60 })
    }

    return errorResponse(
      errorMessage,
      error?.status || 500,
      {
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
        errorType: error?.name || 'UnknownError'
      }
    )
  }
}