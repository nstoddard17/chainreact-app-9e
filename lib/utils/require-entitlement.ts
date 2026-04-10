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
import type { PlanLimits, PlanTier } from '@/lib/utils/plan-restrictions'
import { hasFeatureAccessFromDB, getPlanLimitsFromDB } from '@/lib/plans/server-cache'
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
    .select('plan, admin_capabilities')
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
  const capabilities = (data as any).admin_capabilities || {}
  const isAdmin = capabilities.super_admin === true ||
    Object.values(capabilities).some((v: unknown) => v === true)
  return { plan: normalized, isAdmin }
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
      upgradeUrl: '/subscription',
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
      upgradeUrl: '/subscription',
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

  const hasAccess = await hasFeatureAccessFromDB(plan, String(feature))
  if (hasAccess) {
    return { allowed: true, plan }
  }

  // Determine which plan is needed by checking each tier
  const tiers: PlanTier[] = ['free', 'pro', 'team', 'business', 'enterprise']
  let requiredPlan: PlanTier | null = null
  for (const tier of tiers) {
    if (await hasFeatureAccessFromDB(tier, String(feature))) {
      requiredPlan = tier
      break
    }
  }

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
  action: 'createWorkflow' | 'activateWorkflow' | 'addTeamMember' | 'useTasks' | 'addBusinessContext',
  currentCount: number,
  required?: number
): Promise<FeatureResult> {
  const { plan, isAdmin } = await getUserPlan(userId)

  if (isAdmin) {
    return { allowed: true, plan }
  }

  const limits = await getPlanLimitsFromDB(plan)

  // Check action against DB limits
  let allowed = true
  let reason = 'Limit reached'
  let upgradeTo: PlanTier = 'pro'

  switch (action) {
    case 'createWorkflow': {
      const max = limits.maxWorkflowsTotal ?? -1
      if (max !== -1 && currentCount >= max) {
        allowed = false
        reason = `You've reached your workflow limit (${max}). Upgrade to create more.`
      }
      break
    }
    case 'activateWorkflow': {
      const max = limits.maxActiveWorkflows ?? -1
      if (max !== -1 && currentCount >= max) {
        allowed = false
        reason = `You've reached your active workflow limit (${max}). Upgrade to activate more.`
      }
      break
    }
    case 'addTeamMember': {
      const max = limits.maxTeamMembers ?? 1
      if (max !== -1 && currentCount >= max) {
        allowed = false
        reason = `You've reached your team member limit (${max}). Upgrade for more members.`
        upgradeTo = 'team'
      }
      break
    }
    case 'useTasks': {
      const max = limits.tasksPerMonth ?? 300
      const needed = required ?? 1
      if (max !== -1 && currentCount + needed > max) {
        allowed = false
        reason = `You've used ${currentCount} of ${max} tasks this month.`
      }
      break
    }
    case 'addBusinessContext': {
      const max = limits.maxBusinessContextEntries ?? 1
      if (max !== -1 && currentCount >= max) {
        allowed = false
        reason = `You've reached your AI context limit (${max}). Upgrade for more.`
      }
      break
    }
  }

  if (allowed) {
    return { allowed: true, plan }
  }

  return {
    allowed: false,
    response: actionDeniedResponse(action, reason, plan, upgradeTo),
  }
}

// ---------------------------------------------------------------------------
// Scope-aware entitlements (Phase 4)
// ---------------------------------------------------------------------------
// Entitlements resolve from the resource's owning scope.
// Current backend maps scope -> owner user's user_profiles.
// When scope-native subscriptions exist (Phase 6), the backend changes
// but the API contract does not.

import type { BillingScope } from '@/lib/billing/types'

/**
 * Resolve the entitlement context for a billing scope.
 * Returns the plan, tasks used, and tasks limit for the owning scope.
 * No fallback. Missing data = throw.
 */
export async function resolveEntitlementContext(
  scope: BillingScope
): Promise<{ plan: PlanTier; tasksUsed: number; tasksLimit: number }> {
  const supabase = await createSupabaseServiceClient()

  if (scope.scopeType === 'user') {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('plan, tasks_used, tasks_limit')
      .eq('id', scope.scopeId)
      .single()

    if (error || !data) {
      throw new Error(`Entitlement lookup failed for user ${scope.scopeId}: ${error?.message}`)
    }

    return {
      plan: normalizePlan(data.plan) as PlanTier,
      tasksUsed: data.tasks_used ?? 0,
      tasksLimit: data.tasks_limit ?? 100,
    }
  }

  if (scope.scopeType === 'team') {
    // Look up team owner, then resolve their plan
    const { data: ownerMember, error: memberError } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', scope.scopeId)
      .eq('role', 'owner')
      .limit(1)
      .single()

    if (memberError || !ownerMember) {
      throw new Error(`Team ${scope.scopeId} has no owner member`)
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('plan, tasks_used, tasks_limit')
      .eq('id', ownerMember.user_id)
      .single()

    if (error || !data) {
      throw new Error(`Entitlement lookup failed for team owner ${ownerMember.user_id}: ${error?.message}`)
    }

    return {
      plan: normalizePlan(data.plan) as PlanTier,
      tasksUsed: data.tasks_used ?? 0,
      tasksLimit: data.tasks_limit ?? 100,
    }
  }

  if (scope.scopeType === 'organization') {
    // Look up org owner_id, then resolve their plan
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('owner_id')
      .eq('id', scope.scopeId)
      .single()

    if (orgError || !org || !org.owner_id) {
      throw new Error(`Organization ${scope.scopeId} has no owner`)
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('plan, tasks_used, tasks_limit')
      .eq('id', org.owner_id)
      .single()

    if (error || !data) {
      throw new Error(`Entitlement lookup failed for org owner ${org.owner_id}: ${error?.message}`)
    }

    return {
      plan: normalizePlan(data.plan) as PlanTier,
      tasksUsed: data.tasks_used ?? 0,
      tasksLimit: data.tasks_limit ?? 100,
    }
  }

  throw new Error(`Unknown scope type: ${scope.scopeType}`)
}

/**
 * Check if a scope's plan includes a specific feature.
 * Scope determines entitlement — the acting user's plan is never consulted.
 */
export async function requireScopedFeature(
  feature: keyof PlanLimits,
  scope: BillingScope
): Promise<FeatureResult> {
  const context = await resolveEntitlementContext(scope)

  const hasAccess = await hasFeatureAccessFromDB(context.plan, String(feature))
  if (hasAccess) {
    return { allowed: true, plan: context.plan }
  }

  // Find minimum plan with this feature
  const tiers: PlanTier[] = ['free', 'pro', 'team', 'business', 'enterprise']
  let requiredPlan: PlanTier | null = null
  for (const tier of tiers) {
    if (await hasFeatureAccessFromDB(tier, String(feature))) {
      requiredPlan = tier
      break
    }
  }

  return {
    allowed: false,
    response: featureDeniedResponse(String(feature), context.plan, requiredPlan),
  }
}

/**
 * Check if a user's personal plan includes a specific feature.
 * For personal/global entry points where no workspace context exists.
 */
export async function requirePersonalFeature(
  userId: string,
  feature: keyof PlanLimits
): Promise<FeatureResult> {
  return requireFeature(userId, feature)
}
