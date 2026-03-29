/**
 * Shared Integration Data Route Handler
 *
 * Centralizes the orchestration logic for all provider data routes.
 * Both the dynamic [id]/data route and static provider routes (e.g., gmail/data)
 * delegate to this shared handler.
 *
 * Created: 2026-03-28
 */

// Side-effect: registers all provider data handlers
import '@/lib/integrations/data-handler-registry-init'

import { type NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'
import { getDataHandler, getAvailableDataTypes, getDataConfig, hasDataHandlers } from '@/lib/integrations/data-handler-registry'
import { decryptToken } from '@/lib/integrations/tokenUtils'
import { decrypt, encrypt } from '@/lib/security/encryption'
import { refreshTokenForProvider } from '@/lib/integrations/tokenRefreshService'

/**
 * Standardized failure categories for structured logging.
 *
 * Precedence (deterministic — first match wins):
 *   1. handler_not_found  (error)   — before execution
 *   2. decrypt_failed     (error)   — takes precedence over auth
 *   3. auth_failed        (warn)    — 401/403 or token expired
 *   4. upstream_api_failed (error)  — only after auth succeeds
 *   5. empty_result       (info)    — handler succeeded, 0 items
 */
type FailureCategory =
  | 'handler_not_found'
  | 'decrypt_failed'
  | 'auth_failed'
  | 'upstream_api_failed'
  | 'empty_result'

function logFailure(
  provider: string,
  category: FailureCategory,
  details: Record<string, any>,
) {
  const base = { provider, failureCategory: category, ...details }
  switch (category) {
    case 'empty_result':
      logger.info('[IntegrationData] empty_result', base)
      break
    case 'auth_failed':
      logger.warn('[IntegrationData] auth_failed', base)
      break
    default:
      logger.error(`[IntegrationData] ${category}`, base)
  }
}

const getSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  )

/**
 * Handle an integration data request for the given provider.
 *
 * This is the single source of truth for: handler lookup, DB fetch,
 * token decryption, handler execution (with retry), and response shaping.
 */
export async function handleIntegrationDataRequest(
  provider: string,
  req: NextRequest,
): Promise<Response> {
  const startTime = Date.now()

  logger.info('[IntegrationData] Route hit', { provider })

  // Validate provider has registered handlers
  if (!hasDataHandlers(provider)) {
    logFailure(provider, 'handler_not_found', { reason: 'no registered handlers' })
    return errorResponse(`Unknown provider: ${provider}`, 404)
  }

  const config = getDataConfig(provider)
  if (!config) {
    logFailure(provider, 'handler_not_found', { reason: 'no data config' })
    return errorResponse(`No data config for provider: ${provider}`, 404)
  }

  try {
    // Parse request body
    const body = await req.json()
    const { integrationId, dataType, options = {} } = body

    if (!integrationId || !dataType) {
      return errorResponse('Missing required parameters: integrationId and dataType', 400)
    }

    // Look up handler
    const handler = getDataHandler(provider, dataType)
    if (!handler) {
      const available = getAvailableDataTypes(provider)
      logFailure(provider, 'handler_not_found', { dataType, available })
      return errorResponse(
        `Unsupported data type "${dataType}" for provider "${provider}". Available: ${available.join(', ')}`,
        400,
      )
    }

    logger.info('[IntegrationData] Handler resolved', { provider, dataType })

    // Fetch integration from database
    const supabase = getSupabase()
    const dbProvider = config.dbProviderName
    let query = supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)

    if (Array.isArray(dbProvider)) {
      query = query.in('provider', dbProvider)
    } else {
      query = query.eq('provider', dbProvider)
    }

    const { data: integration, error: dbError } = await query.single()

    if (dbError || !integration) {
      logger.error('[IntegrationData] Integration not found', {
        provider,
        integrationId,
        error: dbError?.message,
      })
      return errorResponse(`${provider} integration not found`, 404)
    }

    // Validate status
    if (config.validStatuses.length > 0 && !config.validStatuses.includes(integration.status)) {
      logger.error('[IntegrationData] Invalid status', {
        provider,
        integrationId,
        status: integration.status,
      })
      return errorResponse(
        `${provider} integration is not connected. Please reconnect your account.`,
        400,
        { needsReconnection: true, currentStatus: integration.status },
      )
    }

    // Decrypt tokens if needed
    let decryptedToken: string | null = null
    let integrationWithToken = { ...integration }

    if (config.tokenDecryption === 'decryptToken') {
      decryptedToken = await decryptToken(integration.access_token)
      if (!decryptedToken) {
        logFailure(provider, 'decrypt_failed', { integrationId, method: 'decryptToken' })
        return errorResponse(
          'Failed to decrypt access token. Please reconnect your account.',
          500,
          { needsReconnection: true },
        )
      }
      integrationWithToken.access_token = decryptedToken

      if (config.decryptRefreshToken && integration.refresh_token) {
        const decryptedRefresh = await decryptToken(integration.refresh_token)
        if (decryptedRefresh) {
          integrationWithToken.refresh_token = decryptedRefresh
        }
      }
    } else if (config.tokenDecryption === 'decrypt-with-key') {
      const encryptionKey = process.env.ENCRYPTION_KEY
      if (!encryptionKey) {
        logFailure(provider, 'decrypt_failed', { integrationId, reason: 'ENCRYPTION_KEY not set' })
        return errorResponse('Encryption key not configured', 500)
      }

      // Support GitHub's encrypted_data JSON format
      if (integration.encrypted_data) {
        try {
          const parsed = JSON.parse(integration.encrypted_data)
          decryptedToken = decrypt(parsed.access_token || integration.access_token, encryptionKey)
        } catch {
          decryptedToken = decrypt(integration.access_token, encryptionKey)
        }
      } else {
        decryptedToken = decrypt(integration.access_token, encryptionKey)
      }

      if (!decryptedToken) {
        logFailure(provider, 'decrypt_failed', { integrationId, method: 'decrypt-with-key' })
        return errorResponse(
          'Failed to decrypt access token. Please reconnect your account.',
          500,
          { needsReconnection: true },
        )
      }
      integrationWithToken.access_token = decryptedToken

      if (config.decryptRefreshToken && integration.refresh_token) {
        const decryptedRefresh = decrypt(integration.refresh_token, encryptionKey)
        if (decryptedRefresh) {
          integrationWithToken.refresh_token = decryptedRefresh
        }
      }
    }

    // Execute handler (with optional retry on auth error)
    let data: any
    let retried = false

    const executeHandler = async () => {
      if (config.transformHandlerCall) {
        return config.transformHandlerCall(handler, integrationWithToken, decryptedToken, options)
      }
      return handler(integrationWithToken, options)
    }

    try {
      data = await executeHandler()
    } catch (handlerError: any) {
      const isAuthError =
        handlerError.message?.includes('authentication') ||
        handlerError.message?.includes('expired') ||
        handlerError.message?.includes('Unauthorized') ||
        handlerError.statusCode === 401 ||
        handlerError.statusCode === 403

      // Attempt token refresh if configured
      if (
        isAuthError &&
        config.tokenRefresh === 'refresh-and-retry' &&
        integration.refresh_token &&
        !retried
      ) {
        retried = true
        try {
          const refreshResult = await refreshTokenForProvider(
            Array.isArray(config.dbProviderName) ? config.dbProviderName[0] : config.dbProviderName,
            integration.refresh_token,
            integration,
          )

          if (refreshResult.success && refreshResult.accessToken) {
            // Update DB with new tokens
            const encryptedToken = encrypt(refreshResult.accessToken)
            const encryptedRefresh = refreshResult.refreshToken
              ? encrypt(refreshResult.refreshToken)
              : integration.refresh_token

            await supabase
              .from('integrations')
              .update({
                access_token: encryptedToken,
                refresh_token: encryptedRefresh,
                expires_at: refreshResult.accessTokenExpiresIn
                  ? new Date(Date.now() + refreshResult.accessTokenExpiresIn * 1000).toISOString()
                  : integration.expires_at,
                updated_at: new Date().toISOString(),
              })
              .eq('id', integrationId)

            // Retry with new token
            integrationWithToken.access_token = refreshResult.accessToken
            decryptedToken = refreshResult.accessToken
            data = await executeHandler()
          } else {
            throw handlerError // Refresh failed, re-throw original
          }
        } catch (refreshError) {
          // If refresh itself failed, throw original handler error
          if (refreshError === handlerError) throw handlerError
          logger.error('[IntegrationData] Token refresh failed', {
            provider,
            error: (refreshError as Error).message,
          })
          throw handlerError
        }
      } else {
        throw handlerError
      }
    }

    const duration = Date.now() - startTime
    const resultCount = Array.isArray(data) ? data.length : data ? 1 : 0

    if (resultCount === 0) {
      logFailure(provider, 'empty_result', { dataType, duration })
    } else {
      logger.info('[IntegrationData] Success', {
        provider,
        dataType,
        duration,
        resultCount,
      })
    }

    return jsonResponse({
      data,
      success: true,
      integrationId,
      dataType,
    })
  } catch (error: any) {
    const duration = Date.now() - startTime

    // Classify the failure
    const isAuthError =
      error.message?.includes('authentication') ||
      error.message?.includes('expired') ||
      error.message?.includes('Unauthorized')
    const isDecryptError =
      error.message?.includes('decrypt') || error.message?.includes('Encryption')
    const isRateLimit = error.message?.includes('rate limit')

    if (isDecryptError) {
      logFailure(provider, 'decrypt_failed', { error: error.message, duration })
      return errorResponse(error.message, 500, { needsReconnection: true })
    }

    if (isAuthError) {
      logFailure(provider, 'auth_failed', { error: error.message, duration })
      return errorResponse(error.message, 401, { needsReconnection: true })
    }

    if (isRateLimit) {
      logFailure(provider, 'upstream_api_failed', { error: error.message, duration, reason: 'rate_limit' })
      return errorResponse(
        `${provider} API rate limit exceeded. Please try again later.`,
        429,
        { retryAfter: 60 },
      )
    }

    logFailure(provider, 'upstream_api_failed', { error: error.message, duration })
    return errorResponse(error.message || 'Internal server error', 500, {
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })
  }
}
