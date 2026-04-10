/**
 * Server-side plan data cache.
 *
 * Reads from the `plans` DB table and caches in memory.
 * This is the server-side equivalent of the client plansStore.
 *
 * Usage:
 *   const limits = await getPlanLimitsFromDB('pro')
 *   const info = await getPlanInfoFromDB('pro')
 *
 * Fail-closed: if the DB is unreachable and cache is empty, functions
 * throw rather than returning wrong data.
 */

import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { logger } from '@/lib/utils/logger'

export interface ServerPlanData {
  name: string
  displayName: string
  description: string
  priceMonthly: number
  priceAnnual: number
  limits: Record<string, any>
  features: string[]
}

// In-memory cache
let planCache: Map<string, ServerPlanData> = new Map()
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Normalize beta → pro
function normalizeName(name: string | null | undefined): string {
  if (!name) return 'free'
  const lowered = name.toLowerCase().trim()
  if (lowered === 'beta' || lowered === 'beta-pro') return 'pro'
  return lowered
}

/**
 * Refresh the plan cache from the DB.
 * Called automatically when cache is stale.
 */
async function refreshCache(): Promise<void> {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: plans, error } = await supabase
      .from('plans')
      .select('name, display_name, description, price_monthly, price_yearly, limits, features')
      .eq('is_active', true)

    if (error) throw error
    if (!plans || plans.length === 0) throw new Error('No plans found in DB')

    const newCache = new Map<string, ServerPlanData>()
    for (const plan of plans) {
      newCache.set(plan.name, {
        name: plan.name,
        displayName: plan.display_name || plan.name,
        description: plan.description || '',
        priceMonthly: Number(plan.price_monthly) || 0,
        priceAnnual: Number(plan.price_yearly) || 0,
        limits: plan.limits || {},
        features: plan.features || [],
      })
    }

    planCache = newCache
    cacheTimestamp = Date.now()
  } catch (error: any) {
    logger.error('[PlanCache] Failed to refresh from DB', { error: error.message })
    // If we have stale cache data, keep using it rather than failing
    if (planCache.size > 0) {
      logger.warn('[PlanCache] Using stale cache data')
      return
    }
    // No cache at all — fail closed
    throw new Error('Plan data unavailable: DB unreachable and no cached data')
  }
}

/**
 * Ensure cache is fresh, refresh if needed.
 */
async function ensureCache(): Promise<void> {
  if (planCache.size === 0 || Date.now() - cacheTimestamp > CACHE_TTL_MS) {
    await refreshCache()
  }
}

/**
 * Get full plan data from DB cache.
 */
export async function getPlanFromDB(planName: string): Promise<ServerPlanData | null> {
  await ensureCache()
  const normalized = normalizeName(planName)
  return planCache.get(normalized) || null
}

/**
 * Get plan limits from DB cache.
 * Returns the limits JSONB object for the given plan.
 */
export async function getPlanLimitsFromDB(planName: string): Promise<Record<string, any>> {
  const plan = await getPlanFromDB(planName)
  if (!plan) {
    // Fail closed for unknown plans — return most restrictive (free-like) limits
    const freePlan = planCache.get('free')
    if (freePlan) return freePlan.limits
    throw new Error(`Plan "${planName}" not found and no fallback available`)
  }
  return plan.limits
}

/**
 * Get the task limit for a plan by name.
 * Used by billing webhooks and task deduction.
 */
export async function getTaskLimitFromDB(planName: string): Promise<number> {
  const limits = await getPlanLimitsFromDB(planName)
  return limits.tasksPerMonth ?? 300
}

/**
 * Get plan pricing info from DB cache.
 */
export async function getPlanInfoFromDB(planName: string): Promise<{
  name: string
  displayName: string
  description: string
  priceMonthly: number
  priceAnnual: number
  overageRate: number | null
} | null> {
  const plan = await getPlanFromDB(planName)
  if (!plan) return null
  return {
    name: plan.name,
    displayName: plan.displayName,
    description: plan.description,
    priceMonthly: plan.priceMonthly,
    priceAnnual: plan.priceAnnual,
    overageRate: plan.limits.overageRate ?? null,
  }
}

/**
 * Get all active plans from DB cache.
 */
export async function getAllPlansFromDB(): Promise<ServerPlanData[]> {
  await ensureCache()
  return Array.from(planCache.values())
}

/**
 * Check if a plan has access to a boolean feature.
 */
export async function hasFeatureAccessFromDB(planName: string, feature: string): Promise<boolean> {
  const limits = await getPlanLimitsFromDB(planName)
  const value = limits[feature]
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return true
  return false
}
