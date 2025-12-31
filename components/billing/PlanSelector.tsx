"use client"

import { useState } from "react"
import { useBillingStore } from "@/stores/billingStore"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Check, Loader2, AlertTriangle } from "lucide-react"

import { logger } from '@/lib/utils/logger'

interface PlanSelectorProps {
  plans: any[]
  currentSubscription: any
  targetPlanId?: string
}

export default function PlanSelector({ plans, currentSubscription, targetPlanId }: PlanSelectorProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly")
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(targetPlanId || null)
  const { createCheckoutSession } = useBillingStore()

  const handleSelectPlan = async (planId: string) => {
    if (processingPlanId) return

    try {
      setProcessingPlanId(planId)
      setError(null)
      const checkoutUrl = await createCheckoutSession(planId, billingCycle)

      if (!checkoutUrl) {
        throw new Error("No checkout URL returned")
      }

      // Redirect to the checkout URL
      window.location.href = checkoutUrl
    } catch (error: any) {
      logger.error("Failed to create checkout session:", error)

      if (error.message.includes("STRIPE_NOT_CONFIGURED")) {
        setError("Billing is not yet configured for this application. Please contact support.")
      } else {
        setError("There was an error creating your checkout session. Please try again later.")
      }
    } finally {
      setProcessingPlanId(null)
    }
  }

  const togglePlanExpansion = (planId: string) => {
    setExpandedPlanId(expandedPlanId === planId ? null : planId)
  }

  const currentPlanId = currentSubscription?.plan_id
  const yearlyDiscount = 20 // 20% discount for yearly billing

  // Check if any plan has sample price IDs (indicating Stripe is not configured)
  const hasStripeConfig = plans.some(
    (plan) =>
      plan.stripe_price_id_monthly &&
      plan.stripe_price_id_yearly &&
      !plan.stripe_price_id_monthly.includes("_sample") &&
      !plan.stripe_price_id_yearly.includes("_sample"),
  )

  return (
    <div className="space-y-6">
      {!hasStripeConfig && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Billing integration is currently being set up. Some features may not be available yet.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="monthly" className="w-full" onValueChange={(value) => setBillingCycle(value as any)}>
        <TabsList className="grid w-full max-w-xs mx-auto grid-cols-2">
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="yearly">
            Yearly <Badge className="ml-2 bg-green-100 text-green-700">Save {yearlyDiscount}%</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                price={plan.price_monthly}
                billingCycle="monthly"
                isCurrentPlan={plan.id === currentPlanId}
                isProcessing={processingPlanId === plan.id}
                isExpanded={expandedPlanId === plan.id}
                onToggleExpand={() => togglePlanExpansion(plan.id)}
                isDisabled={!hasStripeConfig}
                onSelect={() => handleSelectPlan(plan.id)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="yearly" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                price={plan.price_yearly}
                billingCycle="yearly"
                isCurrentPlan={plan.id === currentPlanId}
                isProcessing={processingPlanId === plan.id}
                isExpanded={expandedPlanId === plan.id}
                onToggleExpand={() => togglePlanExpansion(plan.id)}
                isDisabled={!hasStripeConfig}
                onSelect={() => handleSelectPlan(plan.id)}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface PlanCardProps {
  plan: any
  price: number
  billingCycle: "monthly" | "yearly"
  isCurrentPlan: boolean
  isProcessing: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  isDisabled: boolean
  onSelect: () => void
}

function PlanCard({ 
  plan, 
  price, 
  billingCycle, 
  isCurrentPlan, 
  isProcessing, 
  isExpanded,
  onToggleExpand,
  isDisabled, 
  onSelect 
}: PlanCardProps) {
  return (
    <Card
      className={`bg-white rounded-2xl shadow-lg border transition-all duration-300 transform hover:-translate-y-1 ${
        isCurrentPlan ? "border-orange-500 ring-2 ring-orange-200" : isExpanded ? "border-orange-300" : "border-slate-200"
      } ${isDisabled ? "opacity-60" : ""}`}
    >
      <CardContent className="p-6">
        <div className="text-center mb-6">
          <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
          <div className="mt-2">
            <span className="text-3xl font-bold text-slate-900">${price}</span>
            <span className="text-slate-500">/{billingCycle === "monthly" ? "mo" : "yr"}</span>
          </div>
          <p className="text-sm text-slate-500 mt-2">{plan.description}</p>
        </div>

        {isExpanded && (
          <div className="space-y-4 mb-6">
            {plan.features.map((feature: string, index: number) => (
              <div key={index} className="flex items-center">
                <Check className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" />
                <span className="text-sm text-slate-700">{feature}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col space-y-3">
          {!isExpanded && (
            <Button
              variant="outline"
              className="w-full"
              onClick={onToggleExpand}
            >
              View Details
            </Button>
          )}

          <Button
            className="w-full bg-white text-black border border-slate-200 hover:bg-slate-100 active:bg-slate-200"
            disabled={isCurrentPlan || isProcessing || isDisabled}
            onClick={onSelect}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : isCurrentPlan ? (
              "Current Plan"
            ) : isDisabled ? (
              "Coming Soon"
            ) : (
              `Select ${plan.name}`
            )}
          </Button>

          {isExpanded && (
            <Button
              variant="outline"
              className="w-full"
              onClick={onToggleExpand}
            >
              Hide Details
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
