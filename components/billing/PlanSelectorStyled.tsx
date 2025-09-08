"use client"

import { useState } from "react"
import { useBillingStore } from "@/stores/billingStore"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Check, Loader2, AlertTriangle, Star, Zap, FileText, Building2 } from "lucide-react"

interface PlanSelectorProps {
  plans: any[]
  currentSubscription: any
  targetPlanId?: string
}

// Add mock plans for Business and Enterprise
const mockPlans = [
  {
    id: 'business-tier',
    name: 'Business',
    description: 'For growing teams',
    price_monthly: 49,
    price_yearly: 490,
    features: ['Everything in Pro', 'Priority support', 'Advanced analytics', 'Custom integrations'],
    coming_soon: true
  },
  {
    id: 'enterprise-tier',
    name: 'Enterprise',
    description: 'Custom solutions for large organizations',
    price_monthly: null,
    price_yearly: null,
    features: ['Everything in Business', 'Dedicated support', 'Custom contracts', 'SLA guarantees'],
    coming_soon: true
  }
]

export default function PlanSelector({ plans, currentSubscription, targetPlanId }: PlanSelectorProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly")
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(targetPlanId || null)
  const { createCheckoutSession } = useBillingStore()
  
  // Combine real plans with mock plans
  const allPlans = [...plans, ...mockPlans]

  const handleSelectPlan = async (planId: string) => {
    if (processingPlanId) return
    
    // Don't process mock plans
    const plan = allPlans.find(p => p.id === planId)
    if (plan?.coming_soon) return

    try {
      setProcessingPlanId(planId)
      setError(null)
      const checkoutUrl = await createCheckoutSession(planId, billingCycle === "annual" ? "yearly" : "monthly")

      if (!checkoutUrl) {
        throw new Error("No checkout URL returned")
      }

      window.location.href = checkoutUrl
    } catch (error: any) {
      console.error("Failed to create checkout session:", error)

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
  const yearlyDiscount = 20

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

      <div className="space-y-6">
        {/* Billing Cycle Toggle */}
        <Tabs defaultValue="monthly" className="w-full" onValueChange={(value) => setBillingCycle(value as any)}>
          <TabsList className="grid w-full max-w-xs mx-auto grid-cols-2">
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="annual">
              Annual <Badge className="ml-2 bg-green-100 text-green-700">Save {yearlyDiscount}%</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Plans Grid - Only one of each plan */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {allPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              price={billingCycle === "annual" ? plan.price_yearly : plan.price_monthly}
              billingCycle={billingCycle}
              isCurrentPlan={plan.id === currentPlanId}
              isProcessing={processingPlanId === plan.id}
              isExpanded={expandedPlanId === plan.id}
              onToggleExpand={() => togglePlanExpansion(plan.id)}
              isDisabled={!hasStripeConfig || plan.coming_soon}
              onSelect={() => handleSelectPlan(plan.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface PlanCardProps {
  plan: any
  price: number | null
  billingCycle: "monthly" | "annual"
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
  const isPro = plan.name === 'Pro'
  const isFree = plan.name === 'Free'
  const isBusiness = plan.name === 'Business'
  const isEnterprise = plan.name === 'Enterprise'
  
  // Icon selection based on plan
  const PlanIcon = isFree ? Star : isPro ? Zap : isBusiness ? FileText : Building2
  
  return (
    <div className="relative">
      {/* Badge */}
      {isPro && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
          <Badge className="bg-blue-500 text-white px-4 py-1 text-xs font-semibold">
            MOST POPULAR
          </Badge>
        </div>
      )}
      {plan.coming_soon && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
          <Badge className="bg-gray-500 text-white px-4 py-1 text-xs font-semibold">
            COMING SOON
          </Badge>
        </div>
      )}
      
      <Card
        className={`relative bg-slate-900 border-slate-700 rounded-2xl h-full ${
          isPro ? "border-2 border-blue-500/50" : ""
        } transition-all duration-300 hover:border-slate-600`}
      >
        <CardContent className="p-6 flex flex-col h-full">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center">
              <PlanIcon className="w-8 h-8 text-slate-400" />
            </div>
          </div>
          
          {/* Plan Name */}
          <h3 className="text-xl font-bold text-white text-center mb-4">
            {plan.name}
          </h3>
          
          {/* Price */}
          <div className="text-center mb-4">
            {isEnterprise ? (
              <div className="text-3xl font-bold text-white">Custom</div>
            ) : (
              <>
                <span className="text-4xl font-bold text-white">
                  ${price}
                </span>
                <span className="text-slate-400">/{billingCycle === "monthly" ? "mo" : "yr"}</span>
              </>
            )}
          </div>
          
          {/* Description */}
          <p className="text-sm text-slate-400 text-center mb-6">
            {plan.description}
          </p>
          
          {/* Features (if expanded) */}
          {isExpanded && plan.features && (
            <div className="space-y-2 mb-6 flex-grow">
              {plan.features.slice(0, 4).map((feature: string, index: number) => (
                <div key={index} className="flex items-start">
                  <Check className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-xs text-slate-300">{feature}</span>
                </div>
              ))}
            </div>
          )}
          
          {/* Buttons */}
          <div className="mt-auto space-y-2">
            <Button
              variant="outline"
              className="w-full bg-transparent text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white"
              onClick={onToggleExpand}
            >
              View Details
            </Button>
            
            <Button
              className={`w-full ${
                isPro && !isCurrentPlan
                  ? "bg-blue-500 hover:bg-blue-600 text-white"
                  : plan.coming_soon
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : isFree && isCurrentPlan
                  ? "bg-slate-800 text-slate-400"
                  : "bg-slate-800 hover:bg-slate-700 text-white"
              }`}
              disabled={isProcessing || plan.coming_soon}
              onClick={onSelect}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : plan.coming_soon ? (
                "Coming Soon"
              ) : isFree && !isCurrentPlan ? (
                "Downgrade to Free"
              ) : isPro && !isCurrentPlan ? (
                "Upgrade to Pro"
              ) : isCurrentPlan ? (
                "Current Plan"
              ) : (
                `Select ${plan.name}`
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}