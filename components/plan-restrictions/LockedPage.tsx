'use client'

import { ReactNode, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, ArrowRight } from 'lucide-react'
import { PlanTier, PlanLimits, PLAN_INFO } from '@/lib/utils/plan-restrictions'
import { usePlanRestrictions } from '@/hooks/use-plan-restrictions'
import { UpgradePlanModal } from './UpgradePlanModal'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface LockedPageProps {
  feature: keyof PlanLimits
  title: string
  description: string
  children: ReactNode
  className?: string
}

/**
 * Full-page locking component that shows blurred content with an upgrade prompt overlay.
 * Use this for entire pages that require a higher plan tier.
 * For individual sections/features, use LockedFeature instead.
 */
export function LockedPage({
  feature,
  title,
  description,
  children,
  className = ''
}: LockedPageProps) {
  const router = useRouter()
  const { checkFeatureAccess, isProfileReady } = usePlanRestrictions()
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  const access = checkFeatureAccess(feature)

  // If user has access, render children normally
  if (access.allowed) {
    return <>{children}</>
  }

  // Don't show lock screen until profile is ready
  // This prevents flash of lock screen before profile loads
  if (!isProfileReady) {
    return <>{children}</>
  }

  // Get plan info for the required plan
  const requiredPlan = access.minimumPlan || 'team'
  const planInfo = PLAN_INFO[requiredPlan] || PLAN_INFO.team

  return (
    <>
      <div className={`relative min-h-[400px] ${className}`}>
        {/* Blurred content preview */}
        <div className="blur-sm pointer-events-none select-none" aria-hidden="true">
          {children}
        </div>

        {/* Overlay card */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-8 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-xl border-2">
            <div className="text-center space-y-6">
              {/* Lock icon */}
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="w-8 h-8 text-primary" />
              </div>

              {/* Title and description */}
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">{title}</h2>
                <p className="text-muted-foreground">{description}</p>
              </div>

              {/* Required plan badge */}
              <div className="flex items-center justify-center gap-2">
                <Badge variant="outline" className="text-sm px-3 py-1">
                  Available on {planInfo.name}
                </Badge>
                {planInfo.price > 0 && (
                  <span className="text-sm text-muted-foreground">
                    ${planInfo.price}/{planInfo.billingPeriod}
                  </span>
                )}
              </div>

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setUpgradeModalOpen(true)}
                  className="flex-1"
                >
                  See What's Included
                </Button>
                <Button
                  onClick={() => router.push('/settings/billing')}
                  className="flex-1 gap-2"
                >
                  Upgrade Now
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Upgrade modal */}
      <UpgradePlanModal
        open={upgradeModalOpen}
        onOpenChange={setUpgradeModalOpen}
        requiredPlan={requiredPlan}
        feature={feature}
      />
    </>
  )
}
