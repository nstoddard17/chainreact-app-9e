import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

/**
 * Server-side integration access validator for workflow execution.
 *
 * Validates that a user has permission to use an integration before
 * credentials are decrypted or returned. Uses the existing
 * `can_user_use_integration` RPC which checks integration_permissions,
 * integration_shares, and workspace membership.
 *
 * Cache: Per-process Map with 30-second TTL. This is a performance
 * optimization, not a global consistency guarantee. After permission
 * revocation, access may persist for up to 30s on each serverless
 * instance until the cached entry expires. This is an intentional
 * tradeoff — revocation is a rare admin action and the window is brief.
 *
 * Denial behavior: Both "integration not found" and "no permission"
 * produce the same generic error for callers. Internal logs retain
 * the full reason. This prevents information leakage about whether
 * an integration ID exists.
 */

const ACCESS_DENIED_MESSAGE = 'Access denied: you do not have permission to use this integration. Contact the integration admin to request access.'

interface CacheEntry {
  allowed: boolean
  expiresAt: number
}

// Per-process cache. 30-second TTL.
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30_000

function getCacheKey(userId: string, integrationId: string): string {
  return `${userId}:${integrationId}`
}

function getCachedResult(userId: string, integrationId: string): boolean | null {
  const key = getCacheKey(userId, integrationId)
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.allowed
}

function setCachedResult(userId: string, integrationId: string, allowed: boolean): void {
  // Only cache positive results. Denials and errors are not cached
  // so that a freshly granted permission takes effect immediately.
  if (!allowed) return

  const key = getCacheKey(userId, integrationId)
  cache.set(key, { allowed, expiresAt: Date.now() + CACHE_TTL_MS })

  // Prevent unbounded growth — evict oldest entries if cache exceeds 500
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
}

function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
}

/**
 * Validate that a user has permission to use an integration.
 * Throws on denial or error (fail closed).
 *
 * @param userId - The user attempting to access the integration
 * @param integrationId - The integration being accessed
 * @throws Error with generic ACCESS_DENIED_MESSAGE on denial or RPC failure
 */
export async function validateIntegrationAccess(
  userId: string,
  integrationId: string
): Promise<void> {
  // Check cache first
  const cached = getCachedResult(userId, integrationId)
  if (cached === true) return
  // cached === false won't happen (we don't cache denials), but handle it
  if (cached === false) {
    logger.warn(`[IntegrationAccessValidator] Cached denial for user=${userId} integration=${integrationId}`)
    throw new Error(ACCESS_DENIED_MESSAGE)
  }

  // Call the existing RPC using service-role client (server-side execution)
  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase.rpc('can_user_use_integration', {
      p_user_id: userId,
      p_integration_id: integrationId
    })

    if (error) {
      // Fail closed: RPC error → deny access
      logger.error(`[IntegrationAccessValidator] RPC error for user=${userId} integration=${integrationId}:`, error)
      throw new Error(ACCESS_DENIED_MESSAGE)
    }

    if (data === true) {
      setCachedResult(userId, integrationId, true)
      return
    }

    // Permission denied
    logger.warn(`[IntegrationAccessValidator] Access denied for user=${userId} integration=${integrationId}`)
    throw new Error(ACCESS_DENIED_MESSAGE)
  } catch (err: any) {
    // If it's already our ACCESS_DENIED_MESSAGE, re-throw as-is
    if (err.message === ACCESS_DENIED_MESSAGE) throw err

    // Any other error → fail closed
    logger.error(`[IntegrationAccessValidator] Unexpected error for user=${userId} integration=${integrationId}:`, err)
    throw new Error(ACCESS_DENIED_MESSAGE)
  }
}
