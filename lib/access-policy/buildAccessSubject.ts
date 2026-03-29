import type { AccessSubject } from './types'
import { normalizePlan } from './normalize'

/**
 * Build an AccessSubject from a profile object.
 *
 * This is the ONE place that maps raw profile data to evaluator input.
 * Middleware, server components, and client all use this.
 *
 * `role` is intentionally excluded — route access is determined by
 * plan + admin flag only.
 */
export function buildAccessSubject(
  profile: {
    plan?: string | null
    admin?: boolean | null
    username?: string | null
  } | null,
  isAuthenticated: boolean
): AccessSubject {
  return {
    isAuthenticated,
    hasUsername: !!(profile?.username && profile.username.trim() !== ''),
    plan: normalizePlan(profile?.plan),
    isAdmin: profile?.admin === true,
  }
}
