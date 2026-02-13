"use client"

import React, { useEffect, useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import {
  hasPageAccess,
  getRequiredPlanForPage,
  ProtectedPage,
  PlanTier,
  PLAN_INFO
} from "@/lib/utils/plan-restrictions"
import { Button } from "@/components/ui/button"
import { Lock, Sparkles, ArrowRight } from "lucide-react"
import Link from "next/link"
import { logger } from "@/lib/utils/logger"

interface PageAccessGuardProps {
  page: ProtectedPage
  children: React.ReactNode
}

/**
 * Guards access to pages based on user plan and admin status.
 * Shows an upgrade prompt if user doesn't have access.
 * Renders children optimistically until we can confirm access status.
 *
 * IMPORTANT: The profile may be stale from localStorage initially. We need to
 * wait for the fresh profile to load from the API before making access decisions.
 * The auth store sets initialized=true BEFORE the profile is fully fetched,
 * so we track profile changes to detect when fresh data arrives.
 */
export function PageAccessGuard({ page, children }: PageAccessGuardProps) {
  const { profile, hydrated, initialized, loading } = useAuthStore()
  const [shouldCheckAccess, setShouldCheckAccess] = useState(false)
  const profileUpdateCountRef = useRef(0)
  const initialProfileRef = useRef(profile)
  const searchParams = useSearchParams()

  // Debug mode: force showing the upgrade modal for testing
  const forceUpgradeModal = searchParams.get('forceUpgradeModal') === 'true'

  // Track profile updates to detect when fresh data arrives
  useEffect(() => {
    if (profile !== initialProfileRef.current) {
      profileUpdateCountRef.current += 1
    }
  }, [profile])

  // Wait for profile to be properly loaded before checking access
  useEffect(() => {
    logger.debug('[PageAccessGuard] State check', {
      page,
      hydrated,
      initialized,
      loading,
      hasProfile: !!profile,
      profileAdmin: profile?.admin,
      profilePlan: profile?.plan,
      profileUpdateCount: profileUpdateCountRef.current,
      shouldCheckAccess
    })

    if (!hydrated || !initialized) {
      return
    }

    // If we have a profile with explicit admin=true, allow immediately
    // This handles the case where admin status is correctly in localStorage
    if (profile?.admin === true) {
      logger.debug('[PageAccessGuard] Admin detected, granting access', { page })
      setShouldCheckAccess(true)
      return
    }

    // If we have a profile and it has been updated (fresh from API), check access
    if (profile && profileUpdateCountRef.current > 0) {
      logger.debug('[PageAccessGuard] Profile updated from API, checking access', {
        page,
        admin: profile.admin,
        plan: profile.plan
      })
      setShouldCheckAccess(true)
      return
    }

    // If auth is still loading, wait
    if (loading) {
      return
    }

    // Wait for profile to potentially update with fresh data from API
    // The auth store fetches profile asynchronously after setting initialized=true
    const timer = setTimeout(() => {
      logger.debug('[PageAccessGuard] Timeout reached, checking access', {
        page,
        hasProfile: !!profile,
        admin: profile?.admin,
        plan: profile?.plan
      })
      setShouldCheckAccess(true)
    }, 800) // Give enough time for profile API call to complete

    return () => clearTimeout(timer)
  }, [hydrated, initialized, profile, loading, page, shouldCheckAccess])

  // Get user's plan and admin status
  // Note: 'beta' and 'beta-pro' plans should be treated as 'pro' for access purposes
  const rawPlan = profile?.plan || 'free'
  const userPlan: PlanTier = (rawPlan === 'beta' || rawPlan === 'beta-pro') ? 'pro' : (rawPlan as PlanTier) || 'free'
  const isAdmin = profile?.admin === true

  // If we have a profile with admin access, always allow (check this FIRST)
  // Unless forceUpgradeModal is set for testing
  if (profile && isAdmin && !forceUpgradeModal) {
    return <>{children}</>
  }

  // Don't show lock screen until we've confirmed the user doesn't have access
  // This prevents flash of lock screen before profile loads
  if (!shouldCheckAccess) {
    return <>{children}</>
  }

  // If we have a profile, check access (unless forceUpgradeModal is set for testing)
  if (profile && hasPageAccess(userPlan, page, isAdmin) && !forceUpgradeModal) {
    return <>{children}</>
  }

  // At this point, we've waited for hydration and the user doesn't have access

  // User doesn't have access - show upgrade prompt as modal overlay
  const requiredPlan = getRequiredPlanForPage(page)
  const planInfo = PLAN_INFO[requiredPlan]

  const pageDisplayNames: Record<ProtectedPage, string> = {
    'ai-assistant': 'AI Assistant',
    'analytics': 'Analytics',
    'teams': 'Teams',
    'organization': 'Organization',
  }

  const pageDescriptions: Record<ProtectedPage, string> = {
    'ai-assistant': 'Build workflows faster with AI-powered assistance',
    'analytics': 'Track workflow performance and usage metrics',
    'teams': 'Collaborate with team members on shared workflows',
    'organization': 'Manage your organization settings and permissions',
  }

  // Render children with a blurred overlay modal on top (only blurs main content area)
  return (
    <div className="relative h-full w-full">
      {/* Page content rendered but blurred */}
      <div className="h-full w-full blur-sm pointer-events-none select-none">
        {children}
      </div>

      {/* Modal overlay - only covers the main content area */}
      <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px] z-10">
        <div className="max-w-lg w-full mx-6 bg-white dark:bg-slate-900 rounded-xl border border-border shadow-lg p-8">
          <div className="text-center space-y-5">
            {/* Lock icon */}
            <div className="mx-auto w-14 h-14 rounded-full bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
              <Lock className="w-7 h-7 text-orange-500" />
            </div>

            {/* Title */}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                Upgrade to {planInfo.name} to access {pageDisplayNames[page]}
              </h2>
              <p className="text-sm text-muted-foreground">
                {pageDescriptions[page]}
              </p>
            </div>

            {/* Plan info card */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-500" />
                  <span className="font-medium text-foreground">{planInfo.name} Plan</span>
                </div>
                <span className="text-lg font-bold text-foreground">
                  ${planInfo.price}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                </span>
              </div>
              <p className="text-sm text-muted-foreground text-left">
                {planInfo.description}
              </p>
            </div>

            {/* CTA button */}
            <Button asChild size="default" className="w-full bg-orange-500 hover:bg-orange-600">
              <Link href="/settings/billing">
                Upgrade to {planInfo.name}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>

            {/* Current plan info */}
            <p className="text-xs text-muted-foreground">
              You're currently on the <span className="font-medium">{PLAN_INFO[userPlan]?.name || 'Free'}</span> plan
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
