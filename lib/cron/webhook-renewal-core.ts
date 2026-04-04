/**
 * Core webhook subscription renewal logic.
 * Extracted from app/api/cron/renew-webhook-subscriptions/route.ts
 * for use by the consolidated cron endpoint.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'
import { refreshTokenForProvider } from '@/lib/integrations/tokenRefreshService'
import { decrypt } from '@/lib/security/encryption'
import { getSecret } from '@/lib/secrets'
import { logger } from '@/lib/utils/logger'

const RENEWAL_THRESHOLDS: Record<string, number> = {
  microsoft: 30,
  'microsoft-teams': 30,
  teams: 30,
  outlook: 30,
  onedrive: 30,
  google: 1440,
  gmail: 1440,
  'google-calendar': 1440,
  'google-drive': 1440,
  default: 60,
}

const MAX_SUBSCRIPTIONS_PER_RUN = 50

export interface WebhookRenewalStats {
  processed: number
  renewed: number
  failed: number
  skipped: number
  tokenRefreshed: number
  errors: string[]
  durationMs: number
}

export async function renewWebhookSubscriptionsCore(): Promise<WebhookRenewalStats> {
  const startTime = Date.now()
  const stats: WebhookRenewalStats = {
    processed: 0,
    renewed: 0,
    failed: 0,
    skipped: 0,
    tokenRefreshed: 0,
    errors: [],
    durationMs: 0,
  }

  logger.info('[WebhookRenewal] Starting webhook subscription renewal job')

  const supabase = createAdminClient()
  if (!supabase) {
    throw new Error('Failed to create Supabase client')
  }

  const now = new Date()
  const maxExpirationCheck = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const { data: expiringSubscriptions, error: queryError } = await supabase
    .from('trigger_resources')
    .select('id, workflow_id, user_id, provider_id, resource_type, external_id, expires_at, config, status')
    .eq('resource_type', 'subscription')
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .lte('expires_at', maxExpirationCheck.toISOString())
    .order('expires_at', { ascending: true })
    .limit(MAX_SUBSCRIPTIONS_PER_RUN)

  if (queryError) {
    throw new Error(`Failed to query expiring subscriptions: ${queryError.message}`)
  }

  if (!expiringSubscriptions || expiringSubscriptions.length === 0) {
    logger.info('[WebhookRenewal] No subscriptions need renewal')
    return { ...stats, durationMs: Date.now() - startTime }
  }

  logger.info(`[WebhookRenewal] Found ${expiringSubscriptions.length} subscriptions to check`)

  for (const subscription of expiringSubscriptions) {
    stats.processed++
    try {
      const providerId = subscription.provider_id || ''
      const expiresAt = new Date(subscription.expires_at!)
      const minutesUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60)
      const threshold = getProviderThreshold(providerId)

      if (minutesUntilExpiry > threshold) {
        stats.skipped++
        continue
      }

      const { data: integration, error: integrationError } = await supabase
        .from('integrations')
        .select('*')
        .eq('user_id', subscription.user_id!)
        .ilike('provider', getProviderPattern(providerId))
        .eq('status', 'connected')
        .single()

      if (integrationError || !integration) {
        stats.failed++
        stats.errors.push(`No integration found for ${providerId} subscription ${subscription.id}`)
        continue
      }

      let accessToken = integration.access_token
      if (accessToken && accessToken.includes(':')) {
        try {
          const secret = await getSecret('encryption_key')
          if (secret) { accessToken = decrypt(accessToken, secret) }
        } catch (decryptError) {
          logger.warn('[WebhookRenewal] Failed to decrypt token, trying refresh', decryptError)
        }
      }

      const tokenExpiresAt = integration.expires_at ? new Date(integration.expires_at) : null
      const tokenExpiresIn = tokenExpiresAt ? (tokenExpiresAt.getTime() - now.getTime()) / (1000 * 60) : null

      if (!accessToken || (tokenExpiresIn !== null && tokenExpiresIn < 10)) {
        if (!integration.refresh_token) {
          stats.failed++
          stats.errors.push(`No refresh token for ${providerId} integration`)
          continue
        }
        const refreshResult = await refreshTokenForProvider(integration.provider, integration.refresh_token!, integration as any, { verbose: true })
        if (!refreshResult.success || !refreshResult.accessToken) {
          stats.failed++
          stats.errors.push(`Failed to refresh token for ${providerId}: ${refreshResult.error}`)
          continue
        }
        accessToken = refreshResult.accessToken
        stats.tokenRefreshed++
      }

      const renewed = await renewSubscription(subscription as any, accessToken!, providerId, supabase)
      if (renewed) {
        stats.renewed++
      } else {
        stats.failed++
      }
    } catch (error) {
      stats.failed++
      stats.errors.push(`${subscription.provider_id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    if (Date.now() - startTime > 55000) {
      logger.warn('[WebhookRenewal] Approaching timeout, stopping early')
      break
    }
  }

  stats.durationMs = Date.now() - startTime
  logger.info('[WebhookRenewal] Completed', stats)
  return stats
}

function getProviderThreshold(providerId: string): number {
  const normalized = providerId.toLowerCase().replace(/_/g, '-')
  if (RENEWAL_THRESHOLDS[normalized]) return RENEWAL_THRESHOLDS[normalized]
  for (const [key, value] of Object.entries(RENEWAL_THRESHOLDS)) {
    if (normalized.startsWith(key)) return value
  }
  return RENEWAL_THRESHOLDS.default
}

function getProviderPattern(providerId: string): string {
  const normalized = providerId.toLowerCase()
  if (normalized.includes('microsoft') || normalized.includes('teams')) return 'teams'
  if (normalized.includes('outlook')) return 'outlook'
  if (normalized.includes('onedrive')) return 'onedrive'
  if (normalized.includes('gmail')) return 'gmail'
  if (normalized.includes('google-calendar')) return 'google-calendar'
  if (normalized.includes('google-drive')) return 'google-drive'
  return `%${normalized}%`
}

async function renewSubscription(
  subscription: { id: string; external_id: string | null; provider_id: string | null; config: Record<string, unknown> | null },
  accessToken: string,
  providerId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<boolean> {
  const normalized = providerId.toLowerCase()
  try {
    if (normalized.includes('microsoft') || normalized.includes('teams') || normalized.includes('outlook') || normalized.includes('onedrive')) {
      return await renewMicrosoftSubscription(subscription, accessToken, supabase)
    }
    if (normalized.includes('google') || normalized.includes('gmail')) {
      logger.info('[WebhookRenewal] Google watch renewal delegated to /api/webhooks/google/renew cron job')
      return true
    }
    logger.warn(`[WebhookRenewal] Unknown provider type for renewal: ${providerId}`)
    return false
  } catch (error) {
    logger.error(`[WebhookRenewal] Failed to renew ${providerId} subscription:`, error)
    return false
  }
}

async function renewMicrosoftSubscription(
  subscription: { id: string; external_id: string | null; config: Record<string, unknown> | null },
  accessToken: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<boolean> {
  if (!subscription.external_id) {
    logger.error('[WebhookRenewal] No external_id for Microsoft subscription')
    return false
  }

  const manager = new MicrosoftGraphSubscriptionManager()
  try {
    const renewed = await manager.renewSubscription(subscription.external_id, accessToken)
    if (supabase) {
      await supabase
        .from('trigger_resources')
        .update({ expires_at: renewed.expirationDateTime, updated_at: new Date().toISOString() })
        .eq('id', subscription.id)
    }
    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : ''
    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      if (supabase) {
        await supabase
          .from('trigger_resources')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', subscription.id)
      }
    }
    return false
  }
}
