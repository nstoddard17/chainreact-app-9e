"use client"

import { useEffect, useState } from "react"
import { useBillingStore } from "@/stores/billingStore"
import PlanSelector from "./PlanSelectorStyled"
import SubscriptionDetails from "./SubscriptionDetails"
import UsageStats from "./UsageStats"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Sparkles, CheckCircle } from "lucide-react"
import { useSearchParams } from "next/navigation"

export default function BillingContent() {
  const { plans, currentSubscription, usage, loading, error, fetchPlans, fetchSubscription, fetchUsage, fetchAll } =
    useBillingStore()
  const searchParams = useSearchParams()
  const targetPlanId = searchParams.get("plan")
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    // Fetch all data in parallel for better performance
    fetchAll()
    
    // Check if user just upgraded (comes from parent component's success handling)
    const justUpgraded = sessionStorage.getItem("just_upgraded")
    if (justUpgraded === "true" && currentSubscription?.plan_id !== "free") {
      setShowWelcome(true)
      sessionStorage.removeItem("just_upgraded")
      
      // Hide welcome banner after 10 seconds
      setTimeout(() => setShowWelcome(false), 10000)
    }
  }, [currentSubscription])

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
      {/* Welcome banner for new Pro users */}
      {showWelcome && currentSubscription && (
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-3 duration-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-full">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">Welcome to Pro! 🎉</h2>
                <p className="text-white/90">
                  You now have unlimited workflows, advanced integrations, and priority support.
                </p>
              </div>
            </div>
            <CheckCircle className="h-10 w-10 text-white/80" />
          </div>
        </div>
      )}
      
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
