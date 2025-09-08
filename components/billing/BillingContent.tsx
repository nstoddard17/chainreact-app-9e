"use client"

import { useEffect } from "react"
import { useBillingStore } from "@/stores/billingStore"
import PlanSelector from "./PlanSelectorStyled"
import SubscriptionDetails from "./SubscriptionDetails"
import UsageStats from "./UsageStats"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { useSearchParams } from "next/navigation"

export default function BillingContent() {
  const { plans, currentSubscription, usage, loading, error, fetchPlans, fetchSubscription, fetchUsage } =
    useBillingStore()
  const searchParams = useSearchParams()
  const targetPlanId = searchParams.get("plan")

  useEffect(() => {
    fetchPlans()
    fetchSubscription()
    fetchUsage()
  }, [fetchPlans, fetchSubscription, fetchUsage])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-red-600">Error loading billing information: {error}</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Billing & Subscription</h1>
        <p className="text-gray-600 mt-2">Manage your subscription and view usage statistics</p>
      </div>

      {currentSubscription && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SubscriptionDetails subscription={currentSubscription} />
          <UsageStats usage={usage} subscription={currentSubscription} />
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold mb-6">{currentSubscription ? "Change Plan" : "Choose Your Plan"}</h2>
        <PlanSelector plans={plans} currentSubscription={currentSubscription} targetPlanId={targetPlanId || undefined} />
      </div>
    </div>
  )
}
