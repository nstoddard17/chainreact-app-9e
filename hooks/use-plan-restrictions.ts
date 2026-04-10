import { useEffect, useState, useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { usePlansStore, normalizePlanName } from '@/stores/plansStore'
import type { PlanLimitsData } from '@/stores/plansStore'
import type { PlanTier, PlanLimits } from '@/lib/utils/plan-restrictions'
import { isProfileAdmin } from '@/lib/types/admin'

export interface PlanRestrictionCheck {
  allowed: boolean
  currentPlan: PlanTier
  minimumPlan?: PlanTier
  reason?: string
}

export function usePlanRestrictions() {
  const { profile, phase, loading } = useAuthStore()
  const { getPlanLimits, plans, fetchPlans } = usePlansStore()
  const [isProfileReady, setIsProfileReady] = useState(false)
  const profileUpdateCountRef = useRef(0)
  const initialProfileRef = useRef(profile)

  // Ensure plans are loaded
  useEffect(() => { fetchPlans() }, [fetchPlans])

  // Track profile updates to detect when fresh data arrives from API
  useEffect(() => {
    if (profile !== initialProfileRef.current) {
      profileUpdateCountRef.current += 1
    }
  }, [profile])

  // Determine when profile is ready for access checks
  useEffect(() => {
    if (phase !== 'ready' && phase !== 'degraded') return

    if (isProfileAdmin(profile)) {
      setIsProfileReady(true)
      return
    }

    if (profile && profileUpdateCountRef.current > 0) {
      setIsProfileReady(true)
      return
    }

    if (loading) return

    const timer = setTimeout(() => {
      setIsProfileReady(true)
    }, 800)

    return () => clearTimeout(timer)
  }, [phase, profile, loading])

  const rawPlan = profile?.plan || 'free'
  const currentPlan = normalizePlanName(rawPlan) as PlanTier
  const isAdmin = isProfileAdmin(profile)

  const getCurrentLimits = (): PlanLimitsData => {
    return getPlanLimits(currentPlan)
  }

  const checkFeatureAccess = (feature: keyof PlanLimits): PlanRestrictionCheck => {
    if (isAdmin) return { allowed: true, currentPlan }

    const limits = getCurrentLimits()
    const value = limits[feature as keyof PlanLimitsData]
    let allowed = false
    if (typeof value === 'boolean') allowed = value
    else if (typeof value === 'number') allowed = value !== 0
    else if (typeof value === 'string') allowed = true

    if (allowed) return { allowed: true, currentPlan }

    // Find minimum plan that has this feature
    const tiers: PlanTier[] = ['free', 'pro', 'team', 'business', 'enterprise']
    let minimumPlan: PlanTier | undefined
    for (const tier of tiers) {
      const tierLimits = getPlanLimits(tier)
      const tierValue = tierLimits[feature as keyof PlanLimitsData]
      const tierHas = typeof tierValue === 'boolean' ? tierValue : typeof tierValue === 'number' ? tierValue !== 0 : typeof tierValue === 'string' ? true : false
      if (tierHas) { minimumPlan = tier; break }
    }

    return {
      allowed: false,
      currentPlan,
      minimumPlan,
      reason: `This feature requires ${minimumPlan || 'pro'} plan or higher`
    }
  }

  const checkActionLimit = (
    action: 'createWorkflow' | 'activateWorkflow' | 'addTeamMember' | 'addBusinessContext',
    currentCount: number
  ) => {
    const limits = getCurrentLimits()
    let allowed = true
    let reason: string | undefined
    let upgradeTo: PlanTier | undefined = 'pro'

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
      case 'addBusinessContext': {
        const max = limits.maxBusinessContextEntries ?? 1
        if (max !== -1 && currentCount >= max) {
          allowed = false
          reason = `You've reached your AI context limit (${max}). Upgrade for more.`
        }
        break
      }
    }

    return { allowed, currentPlan, minimumPlan: upgradeTo, reason }
  }

  const isPlanOrHigher = (requiredPlan: PlanTier): boolean => {
    if (isAdmin) return true
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
