"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Clock, RefreshCw } from "lucide-react"
import { useState, useEffect } from "react"
import { createClient } from "@/utils/supabase/client"
import { logger } from "@/lib/utils/logger"

interface SubscriptionExpirationBannerProps {
  userId: string
}

interface Subscription {
  id: string
  plan_id: string
  status: string
  current_period_end: string
  cancel_at_period_end: boolean
}

interface UserTeamsCount {
  count: number
}

/**
 * SubscriptionExpirationBanner - Shows warning when subscription will expire soon
 *
 * Industry best practice: Warn users 5-7 days before subscription ends
 *
 * Shows when:
 * - Subscription is set to cancel at period end
 * - Current period ends in 7 days or less
 * - User has teams (affected resources)
 *
 * Usage:
 * <SubscriptionExpirationBanner userId={user.id} />
 */
export function SubscriptionExpirationBanner({ userId }: SubscriptionExpirationBannerProps) {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [teamsCount, setTeamsCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [reactivating, setReactivating] = useState(false)

  useEffect(() => {
    loadSubscriptionStatus()
  }, [userId])

  const loadSubscriptionStatus = async () => {
    try {
      const supabase = createClient()

      // Get user's active subscription
      const { data: subData, error: subError } = await supabase
        .from("subscriptions")
        .select("id, plan_id, status, current_period_end, cancel_at_period_end")
        .eq("user_id", userId)
        .in("status", ["active", "trialing"])
        .single()

      if (subError || !subData) {
        // No active subscription, nothing to warn about
        setLoading(false)
        return
      }

      // Check if subscription is set to cancel
      if (!subData.cancel_at_period_end) {
        // Auto-renewal is on, no warning needed
        setLoading(false)
        return
      }

      setSubscription(subData)

      // Count user's teams (affected resources)
      const { count, error: teamsError } = await supabase
        .from("teams")
        .select("id", { count: "exact", head: true })
        .eq("created_by", userId)

      if (!teamsError) {
        setTeamsCount(count || 0)
      }
    } catch (error) {
      logger.error("Error loading subscription status:", error)
    } finally {
      setLoading(false)
    }
  }

  const getDaysUntilExpiration = (periodEnd: string): number => {
    const endDate = new Date(periodEnd)
    const now = new Date()
    const diffMs = endDate.getTime() - now.getTime()
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    return Math.max(0, days)
  }

  const handleReactivateSubscription = async () => {
    if (!subscription) return

    setReactivating(true)
    try {
      // Call API to reactivate subscription
      const response = await fetch(`/api/billing/subscriptions/${subscription.id}/reactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        throw new Error("Failed to reactivate subscription")
      }

      // Reload subscription status
      await loadSubscriptionStatus()

      // Show success message (you can add a toast here)
      logger.info("Subscription reactivated successfully")
    } catch (error: any) {
      logger.error("Failed to reactivate subscription:", error)
      alert("Failed to reactivate subscription. Please try again or contact support.")
    } finally {
      setReactivating(false)
    }
  }

  if (loading || !subscription) {
    return null
  }

  const daysRemaining = getDaysUntilExpiration(subscription.current_period_end)
  const expirationDate = new Date(subscription.current_period_end)

  // Only show if expiring within 7 days
  if (daysRemaining > 7) {
    return null
  }

  // Don't show if already expired
  if (daysRemaining < 0) {
    return null
  }

  const isUrgent = daysRemaining <= 2
  const isCritical = daysRemaining === 0

  return (
    <Alert
      variant={isUrgent ? "destructive" : "default"}
      className={
        isCritical
          ? "border-red-600 bg-red-50 dark:bg-red-950/20 animate-pulse"
          : isUrgent
          ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20"
          : "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20"
      }
    >
      {isCritical ? (
        <AlertTriangle className="h-5 w-5 text-red-600" />
      ) : isUrgent ? (
        <AlertTriangle className="h-5 w-5 text-orange-600" />
      ) : (
        <Clock className="h-5 w-5 text-yellow-600" />
      )}
      <AlertTitle className="text-lg font-semibold">
        {isCritical
          ? "⚠️ Critical: Subscription Expires Today"
          : isUrgent
          ? "⚠️ Urgent: Subscription Expiring Soon"
          : "⏰ Subscription Ending Soon"}
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p>
          {isCritical ? (
            <>
              Your subscription expires <strong>today</strong> at{" "}
              <strong>{expirationDate.toLocaleTimeString()}</strong>.
            </>
          ) : (
            <>
              Your subscription will expire in{" "}
              <strong>
                {daysRemaining} {daysRemaining === 1 ? "day" : "days"}
              </strong>{" "}
              on <strong>{expirationDate.toLocaleDateString()}</strong>.
            </>
          )}
        </p>

        {teamsCount > 0 && (
          <div className="bg-white dark:bg-gray-900 p-3 rounded-md border border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium">What will happen:</p>
            <ul className="text-sm mt-2 space-y-1 list-disc list-inside">
              <li>
                <strong>{teamsCount}</strong> {teamsCount === 1 ? "team" : "teams"} will enter a 5-day
                grace period
              </li>
              <li>After 5 days, team workflows will stop executing</li>
              <li>Workflows will be moved to your personal workspace</li>
              <li>You can reactivate anytime to restore full access</li>
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mt-4">
          <Button
            size="sm"
            onClick={handleReactivateSubscription}
            disabled={reactivating}
            className={
              isCritical
                ? "bg-red-600 hover:bg-red-700"
                : isUrgent
                ? "bg-orange-600 hover:bg-orange-700"
                : "bg-yellow-600 hover:bg-yellow-700"
            }
          >
            {reactivating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Reactivating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reactivate Subscription
              </>
            )}
          </Button>

          <Button variant="outline" size="sm" onClick={() => (window.location.href = "/settings/billing")}>
            View Billing Details
          </Button>

          {teamsCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => (window.location.href = "/teams")}>
              Manage Teams ({teamsCount})
            </Button>
          )}
        </div>

        <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
          💡 <strong>Tip:</strong> You can reactivate your subscription at any time before it expires to
          avoid the grace period.
        </p>
      </AlertDescription>
    </Alert>
  )
}
