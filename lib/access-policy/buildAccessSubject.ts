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
    username?: string | null
    admin_capabilities?: Record<string, boolean> | null
  } | null,
  isAuthenticated: boolean
): AccessSubject {
  const capabilities = profile?.admin_capabilities || {}
  const isAdmin = capabilities.super_admin === true ||
    Object.values(capabilities).some(v => v === true)

  return {
    isAuthenticated,
    hasUsername: !!(profile?.username && profile.username.trim() !== ''),
    plan: normalizePlan(profile?.plan),
    isAdmin,
    adminCapabilities: Object.keys(capabilities).length > 0 ? capabilities : undefined,
  }
}
