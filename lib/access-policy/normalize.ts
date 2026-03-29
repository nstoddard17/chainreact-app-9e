import type { AccessPlan } from './types'

const VALID_PLANS = new Set<string>(['free', 'pro', 'team', 'business', 'enterprise'])

const BETA_ALIASES: Record<string, AccessPlan> = {
  'beta': 'pro',
  'beta-pro': 'pro',
}

/**
 * Normalize a raw plan string to a canonical AccessPlan.
 *
 * Pure function — no side effects. Callers are responsible for
 * logging/telemetry when an invalid stored plan is encountered.
 *
 * - 'beta' | 'beta-pro' → 'pro'
 * - null | undefined | unrecognized → 'free'
 */
export function normalizePlan(raw: string | null | undefined): AccessPlan {
  if (raw == null) return 'free'

  const lowered = raw.toLowerCase().trim()

  const alias = BETA_ALIASES[lowered]
  if (alias) return alias

  if (VALID_PLANS.has(lowered)) return lowered as AccessPlan

  return 'free'
}

/**
 * Check whether a raw plan string is a recognized value.
 * Useful for caller-level telemetry on invalid stored plans.
 */
export function isRecognizedPlan(raw: string | null | undefined): boolean {
  if (raw == null) return false
  const lowered = raw.toLowerCase().trim()
  return VALID_PLANS.has(lowered) || lowered in BETA_ALIASES
}
