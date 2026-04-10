/**
 * Cached tier lookup backed by the `plans` table.
 *
 * Lookups use the immutable `plans.code` column, never `plans.name`.
 * Fails closed if the DB is unreachable and no cache exists.
 */

import { createSupabaseServiceClient } from '@/utils/supabase/server'
import type { PlanLimits } from '@/lib/utils/plan-restrictions'
import { logger } from '@/lib/utils/logger'

// ─── Types ───────────────────────────────────────────────────────────

export interface TierRow {
  id: string
  code: string
  name: string
  display_name: string
  tasks_per_month: number
  max_team_members: number
  history_retention_days: number
  max_business_context_entries: number
  feature_flags: Record<string, boolean | string | null>
  price_monthly: number | null
  price_yearly: number | null
  stripe_price_id_monthly: string | null
  stripe_price_id_yearly: string | null
  is_active: boolean
}

// ─── Cache state ─────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

let cachedTiers: Map<string, TierRow> | null = null
let cacheTimestamp = 0

// ─── Internal ────────────────────────────────────────────────────────

async function loadTiersFromDb(): Promise<Map<string, TierRow>> {
  const supabase = await createSupabaseServiceClient()
  // New columns (code, tasks_per_month, etc.) not yet in generated types.
  // Use `as any` until types are regenerated after migration push.
  const { data, error } = await (supabase as any)
    .from('plans')
    .select('id, code, name, display_name, tasks_per_month, max_team_members, history_retention_days, max_business_context_entries, feature_flags, price_monthly, price_yearly, stripe_price_id_monthly, stripe_price_id_yearly, is_active')
    .eq('is_active', true)

  if (error || !data) {
    logger.error('[tier-cache] Failed to load tiers from DB', { error: error?.message })
    throw new Error('Failed to load tiers')
  }

  const map = new Map<string, TierRow>()
  for (const row of data as TierRow[]) {
    map.set(row.code, row)
  }
  return map
}

async function ensureCache(): Promise<Map<string, TierRow>> {
  const now = Date.now()
  if (cachedTiers && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedTiers
  }

  try {
    cachedTiers = await loadTiersFromDb()
    cacheTimestamp = now
    return cachedTiers
  } catch {
    // If we have a stale cache, use it
    if (cachedTiers) {
      logger.warn('[tier-cache] Using stale cache after refresh failure')
      return cachedTiers
    }
    throw new Error('No tier cache available and DB fetch failed')
  }
}

// ─── Convert DB row to PlanLimits ────────────────────────────────────

function tierRowToLimits(row: TierRow): PlanLimits {
  const ff = row.feature_flags || {}
  return {
    tasksPerMonth: row.tasks_per_month,
    maxActiveWorkflows: -1, // always unlimited, tasks are the limiter
    maxWorkflowsTotal: -1,
    multiStepWorkflows: ff.multiStepWorkflows !== false,
    aiAgents: ff.aiAgents === true,
    conditionalPaths: ff.conditionalPaths !== false,
    webhooks: ff.webhooks !== false,
    scheduling: ff.scheduling !== false,
    errorNotifications: ff.errorNotifications !== false,
    teamSharing: ff.teamSharing === true,
    maxTeamMembers: row.max_team_members,
    sharedWorkspaces: ff.sharedWorkspaces === true,
    advancedAnalytics: ff.advancedAnalytics === true,
    prioritySupport: ff.prioritySupport === true,
    dedicatedSupport: ff.dedicatedSupport === true,
    historyRetentionDays: row.history_retention_days,
    detailedLogs: ff.detailedLogs === true,
    maxBusinessContextEntries: row.max_business_context_entries,
    sso: ff.sso === true,
    customContracts: ff.customContracts === true,
    slaGuarantee: typeof ff.slaGuarantee === 'string' ? ff.slaGuarantee : null,
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Get PlanLimits for a tier by its immutable code.
 * Fails closed if tier not found and DB unavailable.
 */
export async function getTierLimitsByCode(tierCode: string): Promise<PlanLimits> {
  const cache = await ensureCache()
  const row = cache.get(tierCode)
  if (row) return tierRowToLimits(row)

  // Try 'free' as fallback for unknown tier codes
  const freeRow = cache.get('free')
  if (freeRow) return tierRowToLimits(freeRow)

  throw new Error(`Tier "${tierCode}" not found in DB and no free tier available`)
}

/**
 * Get the full tier row by its immutable code.
 * Returns null if not found.
 */
export async function getTierByCode(code: string): Promise<TierRow | null> {
  try {
    const cache = await ensureCache()
    return cache.get(code) ?? null
  } catch {
    return null
  }
}

/**
 * Get all active tiers as a map of code -> TierRow.
 */
export async function getAllTiers(): Promise<Map<string, TierRow>> {
  return ensureCache()
}

/**
 * Resolve a Stripe price ID to a tier ID using stripe_tier_mapping.
 * Returns null if no mapping found.
 */
export async function resolveTierByStripePrice(stripePriceId: string): Promise<{ tierId: string; tierCode: string } | null> {
  const supabase = await createSupabaseServiceClient()
  const { data, error } = await (supabase as any)
    .from('stripe_tier_mapping')
    .select('tier_id, plans!inner(code)')
    .eq('stripe_price_id', stripePriceId)
    .single()

  if (error || !data) {
    logger.warn('[tier-cache] No stripe_tier_mapping for price', { stripePriceId })
    return null
  }

  const planData = data.plans as unknown as { code: string }
  return {
    tierId: data.tier_id,
    tierCode: planData.code,
  }
}

/**
 * Invalidate the in-memory cache. Call after admin edits tiers.
 */
export function invalidateTierCache(): void {
  cachedTiers = null
  cacheTimestamp = 0
}
