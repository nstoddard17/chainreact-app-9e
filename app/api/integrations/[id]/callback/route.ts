/**
 * Dynamic OAuth Callback Route
 *
 * Handles OAuth callbacks for all providers via a single dynamic route.
 * The [id] param receives the provider name (e.g., "slack", "gmail").
 *
 * Static provider routes (e.g., app/api/integrations/slack/callback/route.ts)
 * take priority in Next.js routing. As static routes are deleted, requests
 * fall through to this dynamic route.
 *
 * Created: 2026-03-28
 */

import { type NextRequest } from 'next/server'
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { isKnownProvider, getProviderDefinition } from '@/lib/integrations/provider-registry'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { logger } from '@/lib/utils/logger'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const baseUrl = getBaseUrl()
  const startTime = Date.now()

  // Defensive: reject UUIDs — those are for the DELETE route at [id]/route.ts
  if (UUID_REGEX.test(id)) {
    logger.error('[IntegrationRoute] Callback received UUID instead of provider name', { id })
    return createPopupResponse('error', 'unknown', 'Invalid provider name', baseUrl)
  }

  // Validate provider exists in registry
  if (!isKnownProvider(id)) {
    logger.error('[IntegrationRoute] Unknown provider in callback', { provider: id })
    return createPopupResponse('error', id, `Unknown provider: ${id}`, baseUrl)
  }

  const provider = id

  try {
    const definition = getProviderDefinition(provider)
    const entry = definition.callback

    // Run pre-handler if defined (e.g., Discord bot OAuth flow)
    if (entry.preHandler) {
      const earlyResponse = await entry.preHandler(request)
      if (earlyResponse) {
        const duration = Date.now() - startTime
        logger.info('[IntegrationRoute] Callback pre-handler returned early', { provider, duration })
        return earlyResponse
      }
    }

    // Build config and delegate to handleOAuthCallback
    const config = entry.config(baseUrl)
    const response = await handleOAuthCallback(request, config)

    const duration = Date.now() - startTime
    logger.info('[IntegrationRoute] Callback completed', { provider, duration })

    return response
  } catch (error) {
    const duration = Date.now() - startTime
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    logger.error('[IntegrationRoute] Callback failed', { provider, error: message, duration })
    return createPopupResponse('error', provider, message, baseUrl)
  }
}
