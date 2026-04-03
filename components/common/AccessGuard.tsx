"use client"

import React from "react"
import { useSearchParams } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { buildAccessSubject } from "@/lib/access-policy/buildAccessSubject"
import { evaluateAccess } from "@/lib/access-policy/evaluateAccess"
import { isRecognizedPlan } from "@/lib/access-policy/normalize"
import type { AccessPlan } from "@/lib/access-policy/types"
import { PLAN_INFO } from "@/lib/utils/plan-restrictions"
import { Button } from "@/components/ui/button"
import { Lock, Sparkles, ArrowRight, Loader2 } from "lucide-react"
import Link from "next/link"
import { logger } from "@/lib/utils/logger"

interface AccessGuardProps {
  pathname: string
  children: React.ReactNode
}

const PAGE_DISPLAY_NAMES: Record<string, string> = {
  '/ai-assistant': 'AI Assistant',
  '/analytics': 'Analytics',
  '/teams': 'Teams',
  '/organization': 'Organization',
}

const PAGE_DESCRIPTIONS: Record<string, string> = {
  '/ai-assistant': 'Build workflows faster with AI-powered assistance',
  '/analytics': 'Track workflow performance and usage metrics',
  '/teams': 'Collaborate with team members on shared workflows',
  '/organization': 'Manage your organization settings and permissions',
}

/**
 * Guards access to pages based on the canonical access policy.
 *
 * Server (middleware) is authoritative for enforcement.
 * This component is UX-only: it shows upgrade modals for plan-gated pages.
 *
 * Renders a neutral loading state while auth is unresolved — no timing hacks.
 */
export function AccessGuard({ pathname, children }: AccessGuardProps) {
  const { user, profile, phase } = useAuthStore()
  const searchParams = useSearchParams()
  const forceUpgradeModal = searchParams.get('forceUpgradeModal') === 'true'

  // Neutral loading state while auth is unresolved
  if (phase !== 'ready' && phase !== 'degraded') {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Log unrecognized stored plan values for telemetry
  if (profile?.plan && !isRecognizedPlan(profile.plan)) {
    logger.error('[AccessGuard] Unrecognized stored plan value', {
      plan: profile.plan,
      pathname,
    })
  }

  const subject = buildAccessSubject(profile, !!user)
  const decision = evaluateAccess(subject, pathname)

  // Admin bypass (unless testing)
  if (decision.allowed && !forceUpgradeModal) {
    return <>{children}</>
  }

  // If allowed but force-testing modal, treat as denied with the route's required plan
  if (decision.allowed && forceUpgradeModal) {
    // Fall through to render the upgrade modal
  }

  // For non-modal denials, the server (middleware) handles redirects.
  // Client just renders children as fallback — middleware should have already redirected.
  if (!decision.allowed && !decision.denial?.showUpgradeModal && !forceUpgradeModal) {
    return <>{children}</>
  }

  // Show upgrade modal
  const requiredPlan: AccessPlan = decision.denial?.requiredPlan ?? 'pro'
  const planInfo = PLAN_INFO[requiredPlan] ?? PLAN_INFO['pro']
  const userPlanInfo = PLAN_INFO[subject.plan] ?? PLAN_INFO['free']

  const displayName = PAGE_DISPLAY_NAMES[pathname] ?? pathname.replace(/^\//, '').replace(/-/g, ' ')
  const description = PAGE_DESCRIPTIONS[pathname] ?? `Access ${displayName} features`

  return (
    <div className="relative h-full w-full">
      {/* Page content rendered but blurred */}
      <div className="h-full w-full blur-sm pointer-events-none select-none">
        {children}
      </div>

      {/* Modal overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px] z-10">
        <div className="max-w-lg w-full mx-6 bg-white dark:bg-slate-900 rounded-xl border border-border shadow-lg p-8">
          <div className="text-center space-y-5">
            <div className="mx-auto w-14 h-14 rounded-full bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
              <Lock className="w-7 h-7 text-orange-500" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                Upgrade to {planInfo.name} to access {displayName}
              </h2>
              <p className="text-sm text-muted-foreground">
                {description}
              </p>
            </div>

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

            <Button asChild size="default" className="w-full bg-orange-500 hover:bg-orange-600">
              <Link href="/settings/billing">
                Upgrade to {planInfo.name}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>

            <p className="text-xs text-muted-foreground">
              You&apos;re currently on the <span className="font-medium">{userPlanInfo.name}</span> plan
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
