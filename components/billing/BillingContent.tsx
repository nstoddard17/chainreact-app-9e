"use client"

import { useEffect, useState } from "react"
import { useBillingStore } from "@/stores/billingStore"
import { useAuthStore } from "@/stores/authStore"
import PlanSelector from "./PlanSelectorStyled"
import SubscriptionDetails from "./SubscriptionDetails"
import UsageStats from "./UsageStats"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles, CheckCircle, ArrowLeft } from "lucide-react"
import { useSearchParams, useRouter } from "next/navigation"

export default function BillingContent() {
  const { plans, currentSubscription, usage, loading, error, fetchPlans, fetchSubscription, fetchUsage, fetchAll } =
    useBillingStore()
  const { profile } = useAuthStore()
  const searchParams = useSearchParams()
  const router = useRouter()
  const targetPlanId = searchParams.get("plan")
  const [showWelcome, setShowWelcome] = useState(false)

  // Check if user is a beta tester
  const isBetaTester = profile?.role === 'beta-pro'

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

  // Show special message for beta testers
  if (isBetaTester) {
    return (
      <div className="space-y-12">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-r from-purple-500 to-blue-500 p-3 rounded-full">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">Beta Testing Program</h2>
                <p className="text-muted-foreground mb-4">
                  You're currently enrolled in our beta testing program with full Pro access.
                  Thank you for helping us improve ChainReact!
                </p>
                <div className="space-y-2">
                  <p className="text-sm">
                    <strong>Your Benefits:</strong>
                  </p>
                  <ul className="text-sm space-y-1 ml-4">
                    <li>• Up to 50 workflows</li>
                    <li>• 5,000 executions per month</li>
                    <li>• All integrations unlocked</li>
                    <li>• Priority support</li>
                    <li>• Early access to new features</li>
                  </ul>
                </div>
                <div className="mt-4 p-3 bg-blue-500/10 rounded-lg">
                  <p className="text-sm">
                    <strong>Note:</strong> As a beta tester, you have free access to Pro features.
                    When your beta period ends, you'll receive a special discount to continue with a paid plan.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Usage Stats for Beta Testers */}
        {usage && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-slate-800/20 backdrop-blur-sm p-6 rounded-xl border border-slate-700/30">
            <UsageStats usage={usage} subscription={currentSubscription} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-12">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => router.back()}
        className="gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Button>

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
