"use client"

import { SubscriptionExpirationBanner } from "@/components/billing/SubscriptionExpirationBanner"
import { TeamSuspensionBanner } from "@/components/teams/TeamSuspensionBanner"

interface BillingWarningBannersProps {
  userId: string
}

/**
 * BillingWarningBanners - Unified component for all billing-related warnings
 *
 * Shows (in priority order):
 * 1. Subscription expiring soon (5-7 days before)
 * 2. Teams in grace period or suspended
 *
 * Usage in dashboard or main layout:
 * <BillingWarningBanners userId={user.id} />
 *
 * This ensures users always see critical billing warnings at the top of the page.
 */
export function BillingWarningBanners({ userId }: BillingWarningBannersProps) {
  return (
    <div className="space-y-3 mb-6">
      {/* Priority 1: Subscription about to expire (shows 7 days before) */}
      <SubscriptionExpirationBanner userId={userId} />

      {/* Priority 2: Teams in grace period or suspended (shows after downgrade) */}
      <TeamSuspensionBanner userId={userId} />
    </div>
  )
}
