'use client'

import { ReactNode, useState } from 'react'
import { Lock } from 'lucide-react'
import { PlanTier, PlanLimits } from '@/lib/utils/plan-restrictions'
import { usePlanRestrictions } from '@/hooks/use-plan-restrictions'
import { UpgradePlanModal } from './UpgradePlanModal'

interface LockedFeatureProps {
  feature: keyof PlanLimits
  children: ReactNode
  showLockIcon?: boolean
  className?: string
  fallbackMessage?: string
}

/**
 * Wrapper component that locks features behind plan requirements
 * Shows children as disabled with lock icon and opens upgrade modal on click
 */
export function LockedFeature({
  feature,
  children,
  showLockIcon = true,
  className = '',
  fallbackMessage
}: LockedFeatureProps) {
  const { checkFeatureAccess } = usePlanRestrictions()
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [targetPlan, setTargetPlan] = useState<PlanTier | undefined>()

  const access = checkFeatureAccess(feature)

  // If user has access, render children normally
  if (access.allowed) {
    return <>{children}</>
  }

  // User doesn't have access - render locked state
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setTargetPlan(access.minimumPlan)
    setUpgradeModalOpen(true)
  }

  return (
    <>
      <div
        className={`relative cursor-not-allowed opacity-60 ${className}`}
        onClick={handleClick}
        title={fallbackMessage || access.reason || 'This feature is locked'}
      >
        {/* Lock icon overlay */}
        {showLockIcon && (
          <div className="absolute top-2 right-2 z-10 bg-gray-900/80 rounded-full p-1.5">
            <Lock className="w-3.5 h-3.5 text-white" />
          </div>
        )}

        {/* Render children in disabled state */}
        <div className="pointer-events-none">
          {children}
        </div>
      </div>

      {/* Upgrade modal */}
      <UpgradePlanModal
        open={upgradeModalOpen}
        onOpenChange={setUpgradeModalOpen}
        requiredPlan={targetPlan}
        feature={feature}
      />
    </>
  )
}
