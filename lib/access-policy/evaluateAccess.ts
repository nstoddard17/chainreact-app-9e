import type { AccessDecision, AccessPlan, AccessSubject } from './types'
import { getRouteRule } from './routeConfig'

const PLAN_RANK: Record<AccessPlan, number> = {
  free: 0,
  pro: 1,
  team: 2,
  business: 3,
  enterprise: 4,
}

/**
 * Pure access evaluator. No I/O, no side effects, Edge-runtime compatible.
 *
 * Evaluation order:
 * 1. Authentication check
 * 2. Username check
 * 3. Admin bypass
 * 4. Route rule lookup (no rule = allow)
 * 5. adminOnly check
 * 6. allowedPlansExact check
 * 7. minPlan hierarchy check
 */
export function evaluateAccess(subject: AccessSubject, pathname: string): AccessDecision {
  if (!subject.isAuthenticated) {
    return {
      allowed: false,
      denial: { reason: 'not-authenticated', redirectTo: '/auth/login' },
    }
  }

  if (!subject.hasUsername) {
    return {
      allowed: false,
      denial: { reason: 'missing-username', redirectTo: '/auth/setup-username' },
    }
  }

  if (subject.isAdmin) {
    return { allowed: true }
  }

  const rule = getRouteRule(pathname)
  if (!rule) {
    return { allowed: true }
  }

  if (rule.adminOnly) {
    return {
      allowed: false,
      denial: { reason: 'admin-only', redirectTo: '/workflows' },
    }
  }

  if (rule.allowedPlansExact) {
    if (!rule.allowedPlansExact.includes(subject.plan)) {
      return {
        allowed: false,
        denial: {
          reason: 'plan-insufficient',
          redirectTo: '/workflows',
          requiredPlan: rule.allowedPlansExact[0],
        },
      }
    }
    return { allowed: true }
  }

  if (rule.minPlan) {
    if (PLAN_RANK[subject.plan] < PLAN_RANK[rule.minPlan]) {
      return {
        allowed: false,
        denial: {
          reason: 'plan-insufficient',
          requiredPlan: rule.minPlan,
          showUpgradeModal: rule.upgradeModal ?? false,
          redirectTo: rule.upgradeModal ? undefined : '/workflows',
        },
      }
    }
  }

  return { allowed: true }
}
