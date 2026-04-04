/**
 * Retention class utilities for execution data lifecycle.
 *
 * retention_class is stamped at execution creation time so cleanup
 * uses the tier the user was on when the execution ran, not their
 * current tier (prevents deleting data a user paid to keep).
 */

export type RetentionClass = 'free' | 'pro' | 'team'

/** Maps retention class to number of days to keep execution data. */
export const RETENTION_DAYS: Record<RetentionClass, number> = {
  free: 7,
  pro: 30,
  team: 90,
}

/**
 * Resolve a user's retention class from their entitlement tier code.
 * Falls back to 'free' for unknown/missing tiers.
 */
export function resolveRetentionClass(tierCode: string | null | undefined): RetentionClass {
  if (!tierCode) return 'free'
  const normalized = tierCode.toLowerCase()
  if (normalized === 'pro') return 'pro'
  if (normalized === 'team' || normalized === 'enterprise') return 'team'
  return 'free'
}
