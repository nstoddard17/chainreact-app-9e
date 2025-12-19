/**
 * Stripe Integration Data API Route
 * Handles Stripe data requests with proper authentication and error handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from "@supabase/supabase-js"
import { stripeHandlers } from './handlers'
import { StripeIntegration } from './types'
import { logger } from '@/lib/utils/logger'
import { decryptToken } from '@/lib/integrations/tokenUtils'
import { refreshTokenForProvider } from '@/lib/integrations/tokenRefreshService'
import { encrypt } from '@/lib/security/encryption'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function POST(req: NextRequest) {
  try {
    let integrationId, dataType, options = {}

    try {
      const body = await req.json()
      integrationId = body.integrationId
      dataType = body.dataType
      options = body.options || {}

      logger.info('[Stripe API] Received request', {
        integrationId,
        dataType,
        options,
        timestamp: new Date().toISOString()
      })
    } catch (parseError: any) {
      logger.error('[Stripe API] Failed to parse request body', {
        error: parseError.message
      })
      return errorResponse('Invalid JSON in request body', 400, {
        details: parseError.message
      })
    }

    // Validate required parameters
    if (!integrationId || !dataType) {
      return errorResponse('Missing required parameters: integrationId and dataType', 400)
    }

    // Fetch integration from database
    logger.info('[Stripe API] Fetching integration from database', {
      integrationId,
      provider: 'stripe'
    })

    const { data: integrationData, error: integrationError } = await getSupabase()
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('provider', 'stripe')
      .single()

    if (integrationError || !integrationData) {
      logger.error('[Stripe API] Integration not found', {
        integrationId,
        error: integrationError?.message || 'No integration returned',
        errorCode: integrationError?.code
      })
      return errorResponse('Stripe integration not found', 404)
    }

    // Use let so we can update it after token refresh
    let integration = integrationData

    logger.info('[Stripe API] Integration found', {
      integrationId,
      status: integration.status,
      hasToken: !!integration.access_token,
      userId: integration.user_id
    })

    // Validate integration status
    if (integration.status !== 'connected') {
      logger.error('[Stripe API] Integration not connected', {
        integrationId,
        status: integration.status,
        expectedStatus: 'connected'
      })
      return errorResponse('Stripe integration is not connected. Please reconnect your account.', 400, {
        needsReconnection: true,
        currentStatus: integration.status
      })
    }

    // Get the appropriate handler
    const handler = stripeHandlers[dataType as keyof typeof stripeHandlers]
    if (!handler) {
      logger.error('[Stripe API] Unknown data type', {
        dataType,
        availableTypes: Object.keys(stripeHandlers)
      })
      return jsonResponse({
        error: `Unknown Stripe data type: ${dataType}`,
        availableTypes: Object.keys(stripeHandlers)
      }, { status: 400 })
    }

    logger.info('[Stripe API] Handler found, processing request', {
      integrationId,
      dataType,
      status: integration.status,
      hasToken: !!integration.access_token
    })

    // Decrypt the access token
    logger.info('[Stripe API] Decrypting access token', { integrationId })
    const decryptedToken = await decryptToken(integration.access_token)
    if (!decryptedToken) {
      logger.error('[Stripe API] Failed to decrypt access token', {
        integrationId,
        hasEncryptedToken: !!integration.access_token
      })
      return errorResponse('Failed to decrypt access token. Please reconnect your account.', 500, {
        needsReconnection: true
      })
    }

    logger.info('[Stripe API] Token decrypted successfully', { integrationId })

    // Create integration object with decrypted token
    const integrationWithToken: StripeIntegration = {
      ...integration,
      access_token: decryptedToken
    }

    // Execute the handler with retry on auth error
    let data
    let retryCount = 0
    const maxRetries = 1

    while (retryCount <= maxRetries) {
      try {
        logger.info('[Stripe API] Executing handler', {
          integrationId,
          dataType,
          options,
          attempt: retryCount + 1
        })

        data = await handler(integrationWithToken, options)

        logger.info('[Stripe API] Handler executed successfully', {
          integrationId,
          dataType,
          resultCount: Array.isArray(data) ? data.length : (data ? 1 : 0),
          resultType: typeof data,
          isArray: Array.isArray(data)
        })

        // Success - break out of retry loop
        break

      } catch (handlerError: any) {
        logger.error('[Stripe API] Handler execution failed', {
          dataType,
          error: handlerError.message,
          integrationId,
          statusCode: handlerError.statusCode,
          stripeCode: handlerError.code,
          attempt: retryCount + 1
        })

        // Check if this is an authentication error and we have a refresh token
        const isAuthError = handlerError.message?.includes('authentication') ||
                           handlerError.message?.includes('expired') ||
                           handlerError.message?.includes('Unauthorized') ||
                           handlerError.message?.includes('platform_api_key_expired')

        if (isAuthError && retryCount === 0 && integration.refresh_token) {
          logger.info('[Stripe API] Token expired, attempting refresh...', {
            integrationId,
            hasRefreshToken: !!integration.refresh_token
          })

          try {
            // Attempt to refresh the token
            const refreshResult = await refreshTokenForProvider(
              'stripe',
              integration.refresh_token,
              integration.user_id
            )

            if (refreshResult.success && refreshResult.access_token) {
              logger.info('[Stripe API] Token refreshed successfully', {
                integrationId,
                userId: integration.user_id
              })

              // Encrypt the new token
              const encryptedToken = await encrypt(refreshResult.access_token)
              const encryptedRefreshToken = refreshResult.refresh_token
                ? await encrypt(refreshResult.refresh_token)
                : integration.refresh_token

              // Update the integration in the database
              const { error: updateError } = await getSupabase()
                .from('integrations')
                .update({
                  access_token: encryptedToken,
                  refresh_token: encryptedRefreshToken,
                  expires_at: refreshResult.expires_at || integration.expires_at,
                  updated_at: new Date().toISOString()
                })
                .eq('id', integrationId)

              if (updateError) {
                logger.error('[Stripe API] Failed to update tokens in database', {
                  integrationId,
                  error: updateError.message
                })
              } else {
                // Update local integration object with new decrypted token
                integration.access_token = encryptedToken
                integration.refresh_token = encryptedRefreshToken

                // Update the integration with token for retry
                integrationWithToken.access_token = refreshResult.access_token

                // Increment retry count and loop will retry
                retryCount++
                continue
              }
            } else {
              logger.error('[Stripe API] Token refresh failed', {
                integrationId,
                refreshSuccess: refreshResult.success
              })
            }
          } catch (refreshError: any) {
            logger.error('[Stripe API] Token refresh error', {
              integrationId,
              error: refreshError.message
            })
          }
        }

        // If we get here, either it's not an auth error, we don't have a refresh token,
        // or the refresh failed - return the error
        return errorResponse(handlerError.message || 'Failed to fetch Stripe data', 500, {
          details: process.env.NODE_ENV === 'development' ? handlerError.stack : undefined,
          needsReconnection: isAuthError
        })
      }
    }

    logger.info(`[Stripe API] Successfully processed ${dataType}`, {
      integrationId,
      resultCount: Array.isArray(data) ? data.length : (data ? 1 : 0)
    })

    return jsonResponse({
      data,
      success: true,
      integrationId,
      dataType
    })

  } catch (error: any) {
    logger.error('[Stripe API] Unexpected error', {
      error: error.message,
      stack: error.stack
    })

    // Handle authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      return errorResponse(error.message, 401, { needsReconnection: true })
    }

    // Handle rate limit errors
    if (error.message?.includes('rate limit')) {
      return errorResponse('Stripe API rate limit exceeded. Please try again later.', 429, {
        retryAfter: 60
      })
    }

    return errorResponse(error.message || 'Internal server error', 500, {
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}
