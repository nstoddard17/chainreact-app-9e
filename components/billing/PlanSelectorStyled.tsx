"use client"

import { useState } from "react"
import { useBillingStore } from "@/stores/billingStore"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Check, Loader2, AlertTriangle, Info, Lock } from "lucide-react"

import { logger } from '@/lib/utils/logger'

interface PlanSelectorProps {
  plans: any[]
  currentSubscription: any
  targetPlanId?: string
  isModal?: boolean
}

export default function PlanSelector({ plans = [], currentSubscription, targetPlanId, isModal = false }: PlanSelectorProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">(
    currentSubscription?.billing_cycle === "yearly" ? "annual" : "monthly"
  )
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(targetPlanId || null)
  const { createCheckoutSession, changePlan } = useBillingStore()
  
  // Remove duplicate plans by name (in case database has duplicates)
  const uniquePlans = plans.reduce((acc: any[], plan: any) => {
    if (!acc.find(p => p.name === plan.name)) {
      acc.push(plan)
    }
    return acc
  }, [])
  
  // Only use active plans (Free and Pro)
  const activePlans = uniquePlans.filter(p => !p.coming_soon)

  const handlePlanSelection = async (selectedPlanId: string) => {
    logger.debug("handlePlanSelection called with planId:", selectedPlanId)
    logger.debug("Available plans:", plans)
    logger.debug("Current subscription:", currentSubscription)
    
    if (processingPlanId) {
      logger.debug("Already processing a plan, returning")
      return
    }
    
    // Don't process coming soon plans
    const selectedPlan = plans?.find((p: any) => p.id === selectedPlanId)
    if (!selectedPlan) {
      logger.error("Plan not found:", selectedPlanId)
      return
    }
    
    if (selectedPlan.coming_soon) {
      logger.debug("Plan is coming soon, returning")
      return
    }

    try {
      setProcessingPlanId(selectedPlanId)
      setError(null)
      
      const billingPeriod = billingCycle === "annual" ? "yearly" : "monthly"
      logger.debug("Billing period:", billingPeriod)
      
      // If user has an active subscription, change the plan
      if (currentSubscription && currentSubscription.status === "active") {
        logger.debug("Changing existing plan")
        
        // Check if switching from monthly to annual
        const isUpgradeToAnnual = currentSubscription.billing_cycle === "monthly" && billingPeriod === "yearly"
        
        const result = await changePlan(selectedPlanId, billingPeriod)
        
        if (result.scheduledChange && isUpgradeToAnnual) {
          setError(null)
          // Show success message for scheduled annual upgrade
          alert("Success! Your plan will change to annual billing at the end of your current billing period, adding 12 months to your subscription.")
        } else {
          // For immediate changes
          alert("Your plan has been updated successfully!")
        }
        
        // Refresh the page to show updated subscription
        window.location.reload()
      } else {
        // No active subscription, create checkout session
        logger.debug("Creating new checkout session")
        
        const checkoutUrl = await createCheckoutSession(selectedPlanId, billingPeriod)

        if (!checkoutUrl) {
          throw new Error("No checkout URL returned")
        }

        logger.debug("Redirecting to checkout URL:", checkoutUrl)
        window.location.href = checkoutUrl
      }
    } catch (error: any) {
      logger.error("Failed to process plan selection:", error)

      if (error.message?.includes("STRIPE_NOT_CONFIGURED")) {
        setError("Billing is not yet configured for this application. Please contact support.")
      } else {
        setError(error.message || "There was an error processing your request. Please try again later.")
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

        {/* Main Plans Grid - Only Free vs Pro */}
        <div className={`grid grid-cols-1 md:grid-cols-2 ${isModal ? 'gap-6' : 'gap-10'} max-w-4xl mx-auto`}>
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
              onSelect={() => handlePlanSelection(plan.id)}
              isMainCard={true}
              isModal={isModal}
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
  isMainCard?: boolean
  isModal?: boolean
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
  onSelect,
  isMainCard = false,
  isModal = false
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
      {isPro && !isComingSoon && isMainCard && (
        <div className="absolute -top-2.5 left-1/2 transform -translate-x-1/2 z-10">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-md">
            MOST POPULAR
          </div>
        </div>
      )}
      
      <Card
        className={`relative rounded-2xl h-full transition-all duration-300 overflow-hidden ${isPro && !isComingSoon && isMainCard ? "bg-gradient-to-b from-slate-800/90 to-slate-850/90 border-2 border-blue-500/50 shadow-2xl shadow-blue-950/30 hover:shadow-blue-950/40 hover:border-blue-500/70 hover:scale-[1.01]" : isFree && !isComingSoon && isMainCard ? "bg-slate-900/50 border border-slate-700/30 shadow-xl hover:border-slate-600/50 hover:shadow-2xl" : isComingSoon ? "bg-slate-950/20 border border-slate-800/10 relative overflow-hidden" : "bg-slate-900/80 border border-slate-700 hover:border-slate-600"}`}
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
        <CardContent className={`${isModal ? 'p-6' : isMainCard ? 'p-12' : 'p-10'} flex flex-col h-full ${isComingSoon ? 'relative z-0' : ''}`}>
          {/* Plan Name - Responsive sizing */}
          <h3 className={`${isModal ? 'text-2xl' : isMainCard ? 'text-4xl' : 'text-3xl'} font-black text-center ${isModal ? 'mb-2' : 'mb-3'} ${isComingSoon ? 'text-slate-600' : 'text-white'}`}>
            {plan.name}
          </h3>

          {/* Tagline - Smaller and lighter */}
          <p className={`text-xs font-light text-center ${isModal ? 'mb-4' : 'mb-10'} ${isComingSoon ? 'text-slate-700' : 'text-slate-400'}`}>
            {tagline}
          </p>

          {/* Price Section with divider */}
          <div className={`${isModal ? 'pb-4 mb-4' : 'pb-8 mb-8'} border-b border-slate-800/30`}>
            <div className="text-center">
              {isEnterprise ? (
                <div className={`${isModal ? 'text-3xl' : 'text-4xl'} font-bold ${isComingSoon ? 'text-slate-600' : 'text-white'}`}>Custom</div>
              ) : (
                <div>
                  {billingCycle === "annual" && isPro && !isModal && (
                    <div className="text-center mb-2">
                      <span className="text-slate-500 line-through text-lg">$19.99/mo</span>
                      <span className="ml-2 text-green-500 text-sm font-semibold">Save $59.89/year</span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-center gap-1">
                    <span className={`${isModal ? 'text-4xl' : isPro && isMainCard ? 'text-6xl' : 'text-5xl'} font-bold ${isComingSoon ? 'text-slate-600' : 'text-white'}`}>
                      ${billingCycle === "annual" && !isFree && isPro ? "15" : isFree ? "0" : "19.99"}
                    </span>
                    <span className={`text-sm font-medium ${isComingSoon ? 'text-slate-700' : 'text-slate-500'}`}>
                      /{billingCycle === "annual" && !isFree ? "month" : billingCycle === "monthly" ? "month" : "year"}
                    </span>
                  </div>
                  {billingCycle === "annual" && !isFree && isPro && (
                    <div className="text-center mt-1">
                      <span className="text-xs text-slate-500">Billed $179.99 annually</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Features - Better spacing */}
          <div className="flex-grow">
            <div className={isModal ? 'space-y-3' : 'space-y-5'}>
              {(plan.features || []).slice(0, isExpanded ? 8 : 4).map((feature: string, index: number) => (
                <div key={index} className="flex items-start gap-3">
                  <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isComingSoon ? 'text-slate-700' : 'text-green-500'}`} />
                  <span className={`text-sm leading-relaxed ${isComingSoon ? 'text-slate-700' : 'text-slate-300'}`}>
                    {feature}
                  </span>
                </div>
              ))}
            </div>

            {/* View all features link - moved under features */}
            {plan.features && plan.features.length > 4 && !isComingSoon && (
              <button
                onClick={onToggleExpand}
                className={`text-sm text-slate-500 hover:text-slate-400 transition-colors ${isModal ? 'mt-3' : 'mt-6'} text-left`}
              >
                {isExpanded ? "← Show less" : "View all features →"}
              </button>
            )}
          </div>

          {/* Buttons with better hierarchy */}
          <div className={`mt-auto ${isModal ? 'space-y-2 pt-4' : 'space-y-3'}`}>
            {isComingSoon ? (
              <div className="w-full py-3 bg-slate-800/30 text-slate-600 rounded-lg text-center font-medium cursor-not-allowed">
                Coming Soon
              </div>
            ) : (
              <>
                <Button
                  className={`w-full ${isModal ? 'py-3 text-sm' : 'py-6 text-base'} font-semibold transition-all ${isPro && !isCurrentPlan && isMainCard ? "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg hover:shadow-xl hover:scale-[1.02]" : isCurrentPlan ? "bg-slate-800/30 text-slate-500 cursor-default border border-slate-700/50" : isFree && !isCurrentPlan && isMainCard ? "bg-transparent border-2 border-slate-700 hover:bg-slate-800/50 text-slate-200" : "bg-slate-800 hover:bg-slate-700 text-white"}`}
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

              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

