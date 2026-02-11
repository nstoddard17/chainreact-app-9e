"use client"

import React, { useEffect, useState } from "react"
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

interface PageAccessGuardProps {
  page: ProtectedPage
  children: React.ReactNode
}

/**
 * Guards access to pages based on user plan and admin status.
 * Shows an upgrade prompt if user doesn't have access.
 * Renders children optimistically until we can confirm access status.
 */
export function PageAccessGuard({ page, children }: PageAccessGuardProps) {
  const { profile, hydrated, initialized } = useAuthStore()
  const [shouldCheckAccess, setShouldCheckAccess] = useState(false)

  // Wait a tick after hydration to ensure profile is loaded from localStorage
  useEffect(() => {
    if (hydrated && initialized) {
      // Small delay to ensure store is fully populated
      const timer = setTimeout(() => {
        setShouldCheckAccess(true)
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [hydrated, initialized])

  // Get user's plan and admin status
  const userPlan: PlanTier = (profile?.plan as PlanTier) || 'free'
  const isAdmin = profile?.admin === true

  // If we have a profile with admin access, always allow
  if (profile && isAdmin) {
    return <>{children}</>
  }

  // If we have a profile, check access
  if (profile && hasPageAccess(userPlan, page, isAdmin)) {
    return <>{children}</>
  }

  // Don't show lock screen until we've confirmed the user doesn't have access
  // This prevents flash of lock screen before profile loads
  if (!shouldCheckAccess) {
    return <>{children}</>
  }

  // At this point, we've waited for hydration and the user doesn't have access

  // User doesn't have access - show upgrade prompt
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

  return (
    <div className="flex-1 flex items-center justify-center min-h-[400px] bg-background p-8">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Lock icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Lock className="w-8 h-8 text-muted-foreground" />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">
            {pageDisplayNames[page]} requires {planInfo.name}
          </h2>
          <p className="text-muted-foreground">
            {pageDescriptions[page]}
          </p>
        </div>

        {/* Plan info card */}
        <div className="bg-muted/50 rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
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
        <Button asChild size="lg" className="w-full">
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
  )
}
