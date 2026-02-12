import { useEffect, useState, useRef } from 'react'
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
  const { profile, hydrated, initialized, loading } = useAuthStore()
  const [isProfileReady, setIsProfileReady] = useState(false)
  const profileUpdateCountRef = useRef(0)
  const initialProfileRef = useRef(profile)

  // Track profile updates to detect when fresh data arrives from API
  useEffect(() => {
    if (profile !== initialProfileRef.current) {
      profileUpdateCountRef.current += 1
    }
  }, [profile])

  // Determine when profile is ready for access checks
  useEffect(() => {
    if (!hydrated || !initialized) {
      return
    }

    // If we have a profile with explicit admin=true, mark ready immediately
    if (profile?.admin === true) {
      setIsProfileReady(true)
      return
    }

    // If we have a profile that has been updated (fresh from API), mark ready
    if (profile && profileUpdateCountRef.current > 0) {
      setIsProfileReady(true)
      return
    }

    // If auth is still loading, wait
    if (loading) {
      return
    }

    // Wait for profile to potentially update with fresh data from API
    // The auth store fetches profile asynchronously after setting initialized=true
    const timer = setTimeout(() => {
      setIsProfileReady(true)
    }, 800) // Give enough time for profile API call to complete

    return () => clearTimeout(timer)
  }, [hydrated, initialized, profile, loading])

  // Ensure we have a valid plan tier - fallback to 'free' if plan is invalid
  const rawPlan = profile?.plan || 'free'
  const currentPlan = (PLAN_LIMITS[rawPlan as PlanTier] ? rawPlan : 'free') as PlanTier
  const isAdmin = profile?.admin === true

  /**
   * Check if the current user's plan has access to a specific feature
   * Admins always have access to all features
   */
  const checkFeatureAccess = (feature: keyof PlanLimits): PlanRestrictionCheck => {
    // Admins have access to all features
    if (isAdmin) {
      return { allowed: true, currentPlan }
    }

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
   * Admins always pass this check
   */
  const isPlanOrHigher = (requiredPlan: PlanTier): boolean => {
    // Admins are treated as having the highest plan
    if (isAdmin) {
      return true
    }
    const planHierarchy: PlanTier[] = ['free', 'pro', 'team', 'business', 'enterprise']
    const currentIndex = planHierarchy.indexOf(currentPlan)
    const requiredIndex = planHierarchy.indexOf(requiredPlan)
    return currentIndex >= requiredIndex
  }

  return {
    currentPlan,
    isAdmin,
    isProfileReady,
    checkFeatureAccess,
    checkActionLimit,
    getCurrentLimits,
    isPlanOrHigher,
    profile
  }
}
