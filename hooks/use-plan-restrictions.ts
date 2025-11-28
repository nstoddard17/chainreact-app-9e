import { useAuthStore } from '@/stores/authStore'
import {
  PlanTier,
  PlanLimits,
  hasFeatureAccess,
  getMinimumPlanForFeature,
  canPerformAction,
  PLAN_LIMITS
} from '@/lib/utils/plan-restrictions'

export interface PlanRestrictionCheck {
  allowed: boolean
  currentPlan: PlanTier
  minimumPlan?: PlanTier
  reason?: string
}

export function usePlanRestrictions() {
  const profile = useAuthStore((state) => state.profile)
  const currentPlan = (profile?.plan || 'free') as PlanTier

  /**
   * Check if the current user's plan has access to a specific feature
   */
  const checkFeatureAccess = (feature: keyof PlanLimits): PlanRestrictionCheck => {
    const allowed = hasFeatureAccess(currentPlan, feature)

    if (allowed) {
      return { allowed: true, currentPlan }
    }

    const minimumPlan = getMinimumPlanForFeature(feature)
    return {
      allowed: false,
      currentPlan,
      minimumPlan: minimumPlan || undefined,
      reason: `This feature requires ${minimumPlan} plan or higher`
    }
  }

  /**
   * Check if user can perform a specific action based on usage limits
   */
  const checkActionLimit = (
    action: 'createWorkflow' | 'activateWorkflow' | 'addTeamMember',
    currentCount: number
  ) => {
    const result = canPerformAction(currentPlan, action, currentCount)
    return {
      allowed: result.allowed,
      currentPlan,
      minimumPlan: result.upgradeTo,
      reason: result.reason
    }
  }

  /**
   * Get the limits for the current plan
   */
  const getCurrentLimits = (): PlanLimits => {
    return PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free
  }

  /**
   * Check if user is on a specific plan or higher
   */
  const isPlanOrHigher = (requiredPlan: PlanTier): boolean => {
    const planHierarchy: PlanTier[] = ['free', 'pro', 'team', 'business', 'enterprise']
    const currentIndex = planHierarchy.indexOf(currentPlan)
    const requiredIndex = planHierarchy.indexOf(requiredPlan)
    return currentIndex >= requiredIndex
  }

  return {
    currentPlan,
    checkFeatureAccess,
    checkActionLimit,
    getCurrentLimits,
    isPlanOrHigher,
    profile
  }
}
