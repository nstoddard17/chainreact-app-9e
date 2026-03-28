/**
 * Dynamic Integration Data Route
 *
 * Handles data requests for all providers via a single dynamic route.
 * The [id] param receives the provider name (e.g., "slack", "notion").
 *
 * Static provider routes take priority in Next.js routing. As static routes
 * are deleted, requests fall through to this dynamic route.
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const startTime = Date.now()

  // Defensive: reject UUIDs
  if (UUID_REGEX.test(id)) {
    return errorResponse('Invalid provider name', 400)
  }

  const provider = id

  // Validate provider has registered handlers
  if (!hasDataHandlers(provider)) {
    logger.error('[IntegrationRoute] Unknown data provider', { provider })
    return errorResponse(`Unknown provider: ${provider}`, 404)
  }

  const config = getDataConfig(provider)
  if (!config) {
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
      logger.error('[IntegrationRoute] Unknown dataType', { provider, dataType, available })
      return errorResponse(
        `Unsupported data type "${dataType}" for provider "${provider}". Available: ${available.join(', ')}`,
        400
      )
    }

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
      logger.error('[IntegrationRoute] Integration not found', { provider, integrationId, error: dbError?.message })
      return errorResponse(`${provider} integration not found`, 404)
    }

    // Validate status
    if (config.validStatuses.length > 0 && !config.validStatuses.includes(integration.status)) {
      logger.error('[IntegrationRoute] Invalid status', { provider, integrationId, status: integration.status })
      return errorResponse(
        `${provider} integration is not connected. Please reconnect your account.`,
        400,
        { needsReconnection: true, currentStatus: integration.status }
      )
    }

    // Decrypt tokens if needed
    let decryptedToken: string | null = null
    let integrationWithToken = { ...integration }

    if (config.tokenDecryption === 'decryptToken') {
      decryptedToken = await decryptToken(integration.access_token)
      if (!decryptedToken) {
        return errorResponse('Failed to decrypt access token. Please reconnect your account.', 500, {
          needsReconnection: true,
        })
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
        return errorResponse('Failed to decrypt access token. Please reconnect your account.', 500, {
          needsReconnection: true,
        })
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
      const isAuthError = handlerError.message?.includes('authentication') ||
        handlerError.message?.includes('expired') ||
        handlerError.message?.includes('Unauthorized') ||
        handlerError.statusCode === 401 ||
        handlerError.statusCode === 403

      // Attempt token refresh if configured
      if (isAuthError && config.tokenRefresh === 'refresh-and-retry' && integration.refresh_token && !retried) {
        retried = true
        try {
          const refreshResult = await refreshTokenForProvider(
            Array.isArray(config.dbProviderName) ? config.dbProviderName[0] : config.dbProviderName,
            integration.refresh_token,
            integration
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
          logger.error('[IntegrationRoute] Token refresh failed', { provider, error: (refreshError as Error).message })
          throw handlerError
        }
      } else {
        throw handlerError
      }
    }

    const duration = Date.now() - startTime
    logger.info('[IntegrationRoute] Data request success', {
      provider,
      dataType,
      duration,
      resultCount: Array.isArray(data) ? data.length : (data ? 1 : 0),
    })

    return jsonResponse({
      data,
      success: true,
      integrationId,
      dataType,
    })
  } catch (error: any) {
    const duration = Date.now() - startTime
    logger.error('[IntegrationRoute] Data request failed', {
      provider,
      error: error.message,
      duration,
    })

    // Auth errors
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      return errorResponse(error.message, 401, { needsReconnection: true })
    }

    // Rate limit
    if (error.message?.includes('rate limit')) {
      return errorResponse(`${provider} API rate limit exceeded. Please try again later.`, 429, {
        retryAfter: 60,
      })
    }

    return errorResponse(error.message || 'Internal server error', 500, {
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })
  }
}
