/**
 * Default profile fields for new user signup.
 *
 * Single source of truth for initial billing state.
 * Used by both auth/profile and auth/signup creation paths.
 */

import { getTaskLimitFromDB } from '@/lib/plans/server-cache'

export async function buildDefaultProfileFields() {
  const now = new Date()
  const tasksLimit = await getTaskLimitFromDB('free')
  return {
    plan: 'free' as const,
    tasks_used: 0,
    tasks_limit: tasksLimit,
    billing_period_start: now.toISOString(),
    billing_period_end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }
}
