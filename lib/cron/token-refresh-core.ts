/**
 * Core token refresh logic, extracted from app/api/cron/token-refresh/route.ts
 * for use by the consolidated cron endpoint.
 */

import { getAdminSupabaseClient } from '@/lib/supabase/admin'
import { refreshTokenForProvider } from '@/lib/integrations/tokenRefreshService'
import { classifyOAuthError } from '@/lib/integrations/errorClassificationService'
import {
  computeTransitionAndNotify,
  buildHealthySignal,
  buildFailureSignal,
  type Integration as HealthIntegration,
} from '@/lib/integrations/healthTransitionEngine'
import { logger } from '@/lib/utils/logger'

export interface TokenRefreshOptions {
  provider?: string
  limit?: number
  batchSize?: number
  offset?: number
  verbose?: boolean
}

export interface TokenRefreshResult {
  success: boolean
  processed: number
  successful: number
  failed: number
  durationMs: number
}

/**
 * Performs the full token refresh cycle.
 */
export async function refreshAllTokensCore(
  options: TokenRefreshOptions = {}
): Promise<TokenRefreshResult> {
  const {
    provider,
    limit = 100,
    batchSize = 10,
    offset = 0,
    verbose = false,
  } = options

  const startTime = Date.now()

  logger.info('[TokenRefresh] Job started')

  const supabase = getAdminSupabaseClient()
  if (!supabase) {
    throw new Error('Failed to create database client')
  }

  const now = new Date()
  const expiryThreshold = new Date(now.getTime() + 10 * 60 * 1000)

  let query = supabase
    .from('integrations')
    .select('*')
    .not('refresh_token', 'is', null)
    .neq('status', 'needs_reauthorization')
    .or(`expires_at.lt.${now.toISOString()},expires_at.lt.${expiryThreshold.toISOString()}`)

  if (provider) {
    query = query.eq('provider', provider)
  }

  query = query
    .range(offset, offset + limit - 1)
    .order('expires_at', { ascending: true, nullsFirst: false })

  const { data: integrations, error: fetchError } = await query

  if (fetchError) {
    throw new Error(`Error fetching integrations: ${fetchError.message}`)
  }

  if (!integrations || integrations.length === 0) {
    return { success: true, processed: 0, successful: 0, failed: 0, durationMs: Date.now() - startTime }
  }

  logger.info(`[TokenRefresh] Found ${integrations.length} integrations that need refresh`)

  let successful = 0
  let failed = 0

  const batches = []
  for (let i = 0; i < integrations.length; i += batchSize) {
    batches.push(integrations.slice(i, i + batchSize))
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    for (const integration of batch) {
      try {
        await supabase
          .from('integrations')
          .update({ last_refresh_attempt: now.toISOString() })
          .eq('id', integration.id)

        if (!integration.refresh_token) {
          if (integration.expires_at) {
            const expiresAt = new Date(integration.expires_at)
            const expiredWithGrace = now.getTime() > (expiresAt.getTime() + 10 * 60 * 1000)
            if (expiredWithGrace) {
              await supabase
                .from('integrations')
                .update({
                  status: 'needs_reauthorization',
                  disconnect_reason: 'Access token expired and no refresh token available'
                })
                .eq('id', integration.id)
            }
          }
          continue
        }

        const refreshResult = await refreshTokenForProvider(
          integration.provider,
          integration.refresh_token,
          integration as any,
          { verbose }
        )

        if (refreshResult.success) {
          successful++
          const updateData: Record<string, any> = {
            access_token: refreshResult.accessToken,
            updated_at: now.toISOString(),
            last_refresh_success: now.toISOString(),
            consecutive_failures: 0,
            consecutive_transient_failures: 0,
            disconnect_reason: null,
            status: 'connected',
          }
          if (refreshResult.refreshToken) {
            updateData.refresh_token = refreshResult.refreshToken
          }
          if (refreshResult.accessTokenExpiresIn) {
            updateData.expires_at = new Date(now.getTime() + refreshResult.accessTokenExpiresIn * 1000).toISOString()
          }
          await supabase.from('integrations').update(updateData).eq('id', integration.id)

          const healthIntegration = {
            id: integration.id,
            user_id: integration.user_id,
            provider: integration.provider,
            health_check_status: (integration as any).health_check_status ?? null,
            last_notification_milestone: (integration as any).last_notification_milestone ?? null,
            requires_user_action: (integration as any).requires_user_action ?? false,
            user_action_type: (integration as any).user_action_type ?? null,
            user_action_deadline: (integration as any).user_action_deadline ?? null,
          } as HealthIntegration
          await computeTransitionAndNotify(supabase, healthIntegration, buildHealthySignal('token_refresh'))
        } else {
          failed++

          const { data } = await supabase
            .from('integrations')
            .select('consecutive_failures, consecutive_transient_failures')
            .eq('id', integration.id)
            .single()

          const isTransient = refreshResult.isTransientFailure || false
          let newAuthFailures = data?.consecutive_failures || 0
          let newTransientFailures = data?.consecutive_transient_failures || 0
          if (isTransient) {
            newTransientFailures++
          } else {
            newAuthFailures++
          }

          const shouldMarkDisconnected =
            refreshResult.invalidRefreshToken ||
            refreshResult.needsReauthorization ||
            newAuthFailures >= 3

          const updateData: Record<string, any> = {
            consecutive_failures: newAuthFailures,
            consecutive_transient_failures: newTransientFailures,
            disconnect_reason: refreshResult.error || 'Unknown error during token refresh',
            last_failure_at: now.toISOString(),
          }
          if (shouldMarkDisconnected) {
            updateData.status = 'needs_reauthorization'
          }
          await supabase.from('integrations').update(updateData).eq('id', integration.id)

          try {
            const classifiedError = classifyOAuthError(
              integration.provider,
              refreshResult.statusCode || 0,
              { error: refreshResult.error, message: refreshResult.error }
            )
            const healthIntegration = {
              id: integration.id,
              user_id: integration.user_id,
              provider: integration.provider,
              health_check_status: (integration as any).health_check_status ?? null,
              last_notification_milestone: (integration as any).last_notification_milestone ?? null,
              requires_user_action: (integration as any).requires_user_action ?? false,
              user_action_type: (integration as any).user_action_type ?? null,
              user_action_deadline: (integration as any).user_action_deadline ?? null,
            } as HealthIntegration
            await computeTransitionAndNotify(supabase, healthIntegration, buildFailureSignal(classifiedError, 'token_refresh'))
          } catch (notificationError: any) {
            logger.error(`Failed to process health transition for ${integration.provider}:`, notificationError)
          }
        }
      } catch (error: any) {
        failed++
        logger.error(`Error processing ${integration.provider}:`, error)
      }
    }

    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  try {
    await (supabase as any).rpc('fix_integration_statuses', { threshold_minutes: 60 })
  } catch (error) {
    logger.error('Could not run status fix procedure:', error)
  }

  const durationMs = Date.now() - startTime
  logger.info(`[TokenRefresh] Completed in ${(durationMs / 1000).toFixed(2)}s: ${successful} succeeded, ${failed} failed`)

  return { success: true, processed: integrations.length, successful, failed, durationMs }
}
