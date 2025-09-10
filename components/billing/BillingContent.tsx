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
  const { plans, currentSubscription, usage, loading, error, fetchPlans, fetchSubscription, fetchUsage, fetchAll } =
    useBillingStore()
  const searchParams = useSearchParams()
  const targetPlanId = searchParams.get("plan")

  useEffect(() => {
    // Fetch all data in parallel for better performance
    fetchAll()
  }, [])

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
    <div className="space-y-12">
      {currentSubscription && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-slate-800/20 backdrop-blur-sm p-6 rounded-xl border border-slate-700/30">
          <SubscriptionDetails subscription={currentSubscription} />
          <UsageStats usage={usage} subscription={currentSubscription} />
        </div>
      )}

      <div className="pt-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">{currentSubscription ? "Change Plan" : "Choose Your Plan"}</h2>
          <p className="text-slate-400">Pick the plan that fits your workflow needs. You can switch anytime.</p>
        </div>
        <div className="bg-gradient-to-b from-slate-900/20 to-slate-900/0 rounded-3xl p-1">
          <PlanSelector plans={plans} currentSubscription={currentSubscription} targetPlanId={targetPlanId || undefined} />
        </div>
      </div>
    </div>
  )
}
