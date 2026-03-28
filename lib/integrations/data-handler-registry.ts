/**
 * Global Data Handler Registry
 *
 * Aggregates all per-provider data handler maps into a single registry.
 * Each provider registers its handlers as Record<dataType, handler>.
 *
 * Created: 2026-03-28
 */

import { logger } from '@/lib/utils/logger'

// ================================================================
// TYPES
// ================================================================

/** Standard handler signature — takes integration object + options */
export type DataHandler = (integration: any, options?: any) => Promise<any>

export interface ProviderDataConfig {
  /** Provider name(s) as stored in DB (used in .eq('provider', name)) */
  dbProviderName: string | string[]

  /**
   * Token decryption strategy:
   * - 'decryptToken': uses tokenUtils.decryptToken (Slack, Stripe)
   * - 'decrypt-with-key': uses encryption.decrypt with ENCRYPTION_KEY (GitHub, Airtable)
   * - 'none': pass integration as-is (most providers)
   */
  tokenDecryption: 'decryptToken' | 'decrypt-with-key' | 'none'

  /** Also decrypt refresh_token (needed for refresh-capable providers) */
  decryptRefreshToken: boolean

  /** Statuses considered valid — request fails if status not in this list */
  validStatuses: string[]

  /**
   * Token refresh strategy:
   * - 'none': no refresh (most providers)
   * - 'refresh-and-retry': call refreshTokenForProvider on auth error, retry once (Google, Stripe)
   */
  tokenRefresh: 'none' | 'refresh-and-retry'

  /**
   * Transform handler call for providers with non-standard signatures.
   * GitHub passes (accessToken, params) instead of (integration, options).
   */
  transformHandlerCall?: (
    handler: DataHandler,
    integration: any,
    decryptedToken: string | null,
    options: any
  ) => Promise<any>
}

// ================================================================
// REGISTRY
// ================================================================

const handlerRegistry: Record<string, Record<string, DataHandler>> = {}
const configRegistry: Record<string, ProviderDataConfig> = {}

/** Register a provider's data handlers and config */
export function registerDataProvider(
  provider: string,
  handlers: Record<string, DataHandler>,
  config: ProviderDataConfig
) {
  handlerRegistry[provider] = handlers
  configRegistry[provider] = config
}

/** Get handler for a specific provider + dataType */
export function getDataHandler(provider: string, dataType: string): DataHandler | null {
  return handlerRegistry[provider]?.[dataType] ?? null
}

/** Get all available data types for a provider */
export function getAvailableDataTypes(provider: string): string[] {
  return Object.keys(handlerRegistry[provider] ?? {})
}

/** Get provider data config */
export function getDataConfig(provider: string): ProviderDataConfig | null {
  return configRegistry[provider] ?? null
}

/** Check if a provider has data handlers registered */
export function hasDataHandlers(provider: string): boolean {
  return provider in handlerRegistry
}

/** Log registry stats */
export function logRegistryStats() {
  const providers = Object.keys(handlerRegistry)
  const totalHandlers = providers.reduce((sum, p) => sum + Object.keys(handlerRegistry[p]).length, 0)
  logger.info('[DataHandlerRegistry] Stats', {
    providers: providers.length,
    totalHandlers,
  })
}
