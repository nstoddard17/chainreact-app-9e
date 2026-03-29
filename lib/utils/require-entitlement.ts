/**
 * Server-side feature entitlement enforcement.
 *
 * Route-level access (Phase 1 evaluateAccess) gates which URLs users can reach.
 * This module gates which FEATURES users can use within those routes.
 *
 * Usage in any API route:
 *   const ent = await requireFeature(userId, 'aiAgents')
 *   if (!ent.allowed) return ent.response
 */

import { NextResponse } from 'next/server'

// Polyfill for test environments where Response.json may not exist
const jsonResponse = (body: any, init?: { status?: number }) => {
  return new NextResponse(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { hasFeatureAccess, canPerformAction, type PlanLimits, type PlanTier } from '@/lib/utils/plan-restrictions'
import { normalizePlan, isRecognizedPlan } from '@/lib/access-policy/normalize'
import type { AccessPlan } from '@/lib/access-policy/types'
import { logger } from '@/lib/utils/logger'

// ---------------------------------------------------------------------------
// Internal: fetch user plan from DB
// ---------------------------------------------------------------------------

async function getUserPlan(userId: string): Promise<{ plan: PlanTier; isAdmin: boolean }> {
  const supabase = await createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('user_profiles')
    .select('plan, admin')
    .eq('id', userId)
    .single()

  if (error || !data) {
    logger.error('[requireEntitlement] Failed to fetch user plan', { userId, error: error?.message })
    return { plan: 'free', isAdmin: false }
  }

  // Observable fallback: log unrecognized plan values
  if (data.plan && !isRecognizedPlan(data.plan)) {
    logger.error('[requireEntitlement] Unrecognized stored plan value', { userId, plan: data.plan })
  }

  const normalized = normalizePlan(data.plan) as PlanTier
  return { plan: normalized, isAdmin: data.admin === true }
}

// ---------------------------------------------------------------------------
// Denial response builder (single owner of 403 shape)
// ---------------------------------------------------------------------------

function featureDeniedResponse(
  feature: string,
  currentPlan: PlanTier,
  requiredPlan: PlanTier | null
): NextResponse {
  return jsonResponse(
    {
      error: 'Your plan does not include this feature',
      code: 'FEATURE_NOT_AVAILABLE',
      feature,
      currentPlan,
      requiredPlan: requiredPlan ?? 'pro',
      upgradeUrl: '/settings/billing',
    },
    { status: 403 }
  )
}

function actionDeniedResponse(
  action: string,
  reason: string,
  currentPlan: PlanTier,
  upgradeTo: PlanTier | undefined
): NextResponse {
  return jsonResponse(
    {
      error: reason,
      code: 'ACTION_LIMIT_REACHED',
      action,
      currentPlan,
      requiredPlan: upgradeTo ?? 'pro',
      upgradeUrl: '/settings/billing',
    },
    { status: 403 }
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type FeatureResult =
  | { allowed: true; plan: PlanTier }
  | { allowed: false; response: NextResponse }

/**
 * Check if a user's plan includes a specific feature.
 * Returns allowed:true or a ready-to-return 403 NextResponse.
 */
export async function requireFeature(
  userId: string,
  feature: keyof PlanLimits
): Promise<FeatureResult> {
  const { plan, isAdmin } = await getUserPlan(userId)

  if (isAdmin) {
    return { allowed: true, plan }
  }

  if (hasFeatureAccess(plan, feature)) {
    return { allowed: true, plan }
  }

  const { getMinimumPlanForFeature } = await import('@/lib/utils/plan-restrictions')
  const requiredPlan = getMinimumPlanForFeature(feature)

  return {
    allowed: false,
    response: featureDeniedResponse(String(feature), plan, requiredPlan),
  }
}

/**
 * Check if a user can perform a usage-limited action.
 * Returns allowed:true or a ready-to-return 403 NextResponse.
 */
export async function requireActionLimit(
  userId: string,
  action: 'createWorkflow' | 'activateWorkflow' | 'addTeamMember' | 'useTasks',
  currentCount: number,
  required?: number
): Promise<FeatureResult> {
  const { plan, isAdmin } = await getUserPlan(userId)

  if (isAdmin) {
    return { allowed: true, plan }
  }

  const result = canPerformAction(plan, action, currentCount, required)

  if (result.allowed) {
    return { allowed: true, plan }
  }

  return {
    allowed: false,
    response: actionDeniedResponse(action, result.reason || 'Limit reached', plan, result.upgradeTo as PlanTier | undefined),
  }
}
