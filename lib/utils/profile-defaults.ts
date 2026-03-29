/**
 * Default profile fields for new user signup.
 *
 * Single source of truth for initial billing state.
 * Used by both auth/profile and auth/signup creation paths.
 */

import { PLAN_LIMITS } from '@/lib/utils/plan-restrictions'

export function buildDefaultProfileFields() {
  const now = new Date()
  return {
    plan: 'free' as const,
    tasks_used: 0,
    tasks_limit: PLAN_LIMITS.free.tasksPerMonth,
    billing_period_start: now.toISOString(),
    billing_period_end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }
}
