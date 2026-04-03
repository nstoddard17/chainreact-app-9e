/**
 * Canonical access policy types.
 *
 * Route access is determined by four inputs only:
 *   authentication + username + plan + admin flag
 */

/** Normalized billing tier. Beta variants are mapped to 'pro' before reaching the evaluator. */
export type AccessPlan = 'free' | 'pro' | 'team' | 'business' | 'enterprise'

/** Evaluator input — built via buildAccessSubject(). */
export interface AccessSubject {
  isAuthenticated: boolean
  hasUsername: boolean
  plan: AccessPlan
  isAdmin: boolean
  adminCapabilities?: Record<string, boolean>
}

/** Evaluator output. */
export interface AccessDecision {
  allowed: boolean
  denial?: {
    reason: 'not-authenticated' | 'missing-username' | 'plan-insufficient' | 'admin-only'
    redirectTo?: string
    requiredPlan?: AccessPlan
    showUpgradeModal?: boolean
  }
}

/** Per-route access requirement. */
export interface RouteRule {
  /** Minimum plan tier (hierarchy comparison). */
  minPlan?: AccessPlan
  /** Exact plan match — user's plan must be in this list. */
  allowedPlansExact?: AccessPlan[]
  /** Only users with admin capabilities. */
  adminOnly?: boolean
  /** When denied, client shows upgrade modal instead of middleware redirecting. */
  upgradeModal?: boolean
}
