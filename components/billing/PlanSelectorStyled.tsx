"use client"

import { useState } from "react"
import { useBillingStore } from "@/stores/billingStore"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Check, Loader2, AlertTriangle, Info, ChevronDown, ChevronUp, Lock } from "lucide-react"

interface PlanSelectorProps {
  plans: any[]
  currentSubscription: any
  targetPlanId?: string
}

export default function PlanSelector({ plans, currentSubscription, targetPlanId }: PlanSelectorProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly")
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(targetPlanId || null)
  const [showFuturePlans, setShowFuturePlans] = useState(false)
  const { createCheckoutSession } = useBillingStore()
  
  // Remove duplicate plans by name (in case database has duplicates)
  const uniquePlans = plans.reduce((acc: any[], plan: any) => {
    if (!acc.find(p => p.name === plan.name)) {
      acc.push(plan)
    }
    return acc
  }, [])
  
  // Add mock Business and Enterprise plans for Coming Soon
  const mockFuturePlans = [
    {
      id: 'business-tier',
      name: 'Business',
      description: 'For growing teams',
      price_monthly: 99,
      price_yearly: 990,
      features: [
        '50,000 executions per month',
        'Advanced analytics dashboard',
        'Priority support (24h response)',
        'Custom integrations',
        'Team collaboration (5 members)',
        'API access',
        'Execution history (90 days)',
        'Custom workflows'
      ],
      coming_soon: true
    },
    {
      id: 'enterprise-tier',
      name: 'Enterprise',
      description: 'Custom solutions',
      price_monthly: null,
      price_yearly: null,
      features: [
        'Unlimited executions',
        'Enterprise analytics',
        'Dedicated support (1h response)',
        'White-label options',
        'Unlimited team members',
        'Advanced API access',
        'Execution history (unlimited)',
        'SLA guarantees'
      ],
      coming_soon: true
    }
  ]
  
  // Combine real plans with mock future plans
  const allUniquePlans = [...uniquePlans, ...mockFuturePlans]
  
  // Separate active and coming soon plans
  const activePlans = allUniquePlans.filter(p => !p.coming_soon)
  const futurePlans = allUniquePlans.filter(p => p.coming_soon)

  const handleSelectPlan = async (planId: string) => {
    if (processingPlanId) return
    
    // Don't process coming soon plans
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
    <div className="space-y-8">
      {!hasStripeConfig && (
        <Alert className="bg-amber-950/20 border-amber-900/50">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-amber-200">
            Billing integration is currently being set up. Some features may not be available yet.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="bg-red-950/20 border-red-900/50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-8">
        {/* Billing Cycle Toggle - Integrated with pricing */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-3 bg-slate-900/50 p-1 rounded-full border border-slate-800">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                billingCycle === "monthly"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("annual")}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                billingCycle === "annual"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Annual
              <span className="bg-gradient-to-r from-green-600 to-green-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                Save {yearlyDiscount}%
              </span>
            </button>
          </div>
          <p className="text-slate-500 text-xs">
            {billingCycle === "monthly" ? "Billed monthly" : "Billed annually"}. Cancel or change anytime.
          </p>
        </div>

        {/* Active Plans Grid - Free vs Pro focus */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {activePlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              price={billingCycle === "annual" ? plan.price_yearly : plan.price_monthly}
              billingCycle={billingCycle}
              isCurrentPlan={plan.id === currentPlanId}
              isProcessing={processingPlanId === plan.id}
              isExpanded={expandedPlanId === plan.id}
              onToggleExpand={() => togglePlanExpansion(plan.id)}
              isDisabled={!hasStripeConfig}
              onSelect={() => handleSelectPlan(plan.id)}
            />
          ))}
        </div>
        
        {/* Future Plans Section - Collapsed by default */}
        {futurePlans.length > 0 && (
          <div className="mt-12 pt-8 border-t border-slate-800">
            <button
              onClick={() => setShowFuturePlans(!showFuturePlans)}
              className="w-full max-w-md mx-auto flex items-center justify-center gap-2 text-slate-400 hover:text-slate-300 transition-colors text-sm"
            >
              <span>View Future Plans</span>
              {showFuturePlans ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {showFuturePlans && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mt-6">
                {futurePlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    price={billingCycle === "annual" ? plan.price_yearly : plan.price_monthly}
                    billingCycle={billingCycle}
                    isCurrentPlan={false}
                    isProcessing={false}
                    isExpanded={false}
                    onToggleExpand={() => {}}
                    isDisabled={true}
                    onSelect={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
        )}
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
  const isComingSoon = plan.coming_soon || isBusiness || isEnterprise
  
  // Plan taglines
  const tagline = isFree 
    ? "Perfect for getting started"
    : isPro 
    ? "Best for growing teams"
    : isBusiness
    ? "Advanced features for scale"
    : "Enterprise-grade solutions"
  
  return (
    <div className="relative h-full">
      {/* Floating badge for Pro plan */}
      {isPro && !isComingSoon && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
            MOST POPULAR
          </div>
        </div>
      )}
      
      <Card
        className={`relative rounded-2xl h-full transition-all duration-300 overflow-hidden ${isPro && !isComingSoon ? "bg-gradient-to-b from-slate-800 to-slate-850 border-2 border-blue-500/40 shadow-2xl shadow-blue-950/30 hover:shadow-blue-950/40 hover:border-blue-500/60" : isFree && !isComingSoon ? "bg-slate-900/60 border border-slate-700/40 shadow-lg hover:border-slate-600/60 hover:shadow-xl" : isComingSoon ? "bg-slate-950/20 border border-slate-800/10 relative overflow-hidden" : "bg-slate-900/80 border border-slate-700 hover:border-slate-600"}`}
      >
        {/* Slim highlight bar for Pro plan */}
        {isPro && !isComingSoon && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-blue-400" />
        )}
        
        {/* Coming Soon overlay with lock */}
        {isComingSoon && (
          <>
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] z-10" />
            <div className="absolute top-4 right-4 z-20">
              <Lock className="w-5 h-5 text-slate-600" />
            </div>
          </>
        )}
        <CardContent className={`p-10 flex flex-col h-full ${isComingSoon ? 'relative z-0' : ''}`}>
          {/* Plan Name - Much larger and bolder */}
          <h3 className={`text-3xl font-black text-center mb-2 ${isComingSoon ? 'text-slate-600' : 'text-white'}`}>
            {plan.name}
          </h3>
          
          {/* Tagline - Smaller and lighter */}
          <p className={`text-xs font-light text-center mb-8 ${isComingSoon ? 'text-slate-700' : 'text-slate-500'}`}>
            {tagline}
          </p>
          
          {/* Price Section with divider */}
          <div className="pb-8 mb-8 border-b border-slate-800/30">
            <div className="text-center">
              {isEnterprise ? (
                <div className={`text-4xl font-bold ${isComingSoon ? 'text-slate-600' : 'text-white'}`}>Custom</div>
              ) : (
                <div className="flex items-baseline justify-center gap-1">
                  <span className={`text-5xl font-bold ${isComingSoon ? 'text-slate-600' : 'text-white'}`}>
                    ${price}
                  </span>
                  <span className={`text-sm font-medium ${isComingSoon ? 'text-slate-700' : 'text-slate-500'}`}>/{billingCycle === "monthly" ? "month" : "year"}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Features - Always visible with better spacing */}
          <div className="flex-grow">
            <div className="space-y-4">
              {(plan.features || []).slice(0, isExpanded ? 8 : 4).map((feature: string, index: number) => (
                <div key={index} className="flex items-start gap-3">
                  <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isComingSoon ? 'text-slate-700' : 'text-green-500'}`} />
                  <span className={`text-sm leading-relaxed ${isComingSoon ? 'text-slate-700' : 'text-slate-300'}`}>
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Buttons with better hierarchy */}
          <div className="mt-auto space-y-3">
            {isComingSoon ? (
              <div className="w-full py-3 bg-slate-800/30 text-slate-600 rounded-lg text-center font-medium cursor-not-allowed">
                Coming Soon
              </div>
            ) : (
              <>
                <Button
                  className={`w-full py-6 text-base font-semibold transition-all ${isPro && !isCurrentPlan ? "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg hover:shadow-xl hover:scale-[1.02]" : isCurrentPlan ? "bg-slate-800/30 text-slate-500 cursor-default border border-slate-700/50" : isFree && !isCurrentPlan ? "bg-slate-800/80 hover:bg-slate-700 text-white border border-slate-700" : "bg-slate-800 hover:bg-slate-700 text-white"}`}
                  disabled={isProcessing || isCurrentPlan}
                  onClick={onSelect}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : isCurrentPlan ? (
                    "Current Plan"
                  ) : isFree && !isCurrentPlan ? (
                    "Start Free"
                  ) : isPro && !isCurrentPlan ? (
                    "Upgrade to Pro →"
                  ) : (
                    `Select ${plan.name}`
                  )}
                </Button>
                
                {/* View Details as text link with better spacing */}
                {plan.features && plan.features.length > 4 && !isComingSoon && (
                  <button
                    onClick={onToggleExpand}
                    className="w-full text-left text-sm text-slate-500 hover:text-slate-400 transition-colors pt-4"
                  >
                    {isExpanded ? "← Show less" : "View all features →"}
                  </button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}