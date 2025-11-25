"use client"

import { useState } from "react"
import { useBillingStore } from "@/stores/billingStore"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Check, Loader2, AlertTriangle, Lock, Sparkles, Users, Building2, Crown } from "lucide-react"
import { PLAN_INFO, PLAN_FEATURES, PLAN_LIMITS, type PlanTier } from '@/lib/utils/plan-restrictions'

import { logger } from '@/lib/utils/logger'

interface PlanSelectorProps {
  plans: any[]
  currentSubscription: any
  targetPlanId?: string
  isModal?: boolean
}

// Map database plan names to our tier system
const mapPlanNameToTier = (name: string): PlanTier | null => {
  const normalized = name?.toLowerCase()
  if (normalized === 'free') return 'free'
  if (normalized === 'pro' || normalized === 'professional') return 'pro'
  if (normalized === 'team') return 'team'
  if (normalized === 'business') return 'business'
  if (normalized === 'enterprise') return 'enterprise'
  return null
}

export default function PlanSelector({ plans = [], currentSubscription, targetPlanId, isModal = false }: PlanSelectorProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">(
    currentSubscription?.billing_cycle === "yearly" ? "annual" : "monthly"
  )
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(targetPlanId || null)
  const { createCheckoutSession, changePlan } = useBillingStore()

  const yearlyDiscount = 17

  // Define our pricing tiers
  const tiers: PlanTier[] = ['free', 'pro', 'team', 'business', 'enterprise']

  // Map database plans to our tiers
  const getPlanByTier = (tier: PlanTier) => {
    return plans.find(p => mapPlanNameToTier(p.name) === tier)
  }

  const handlePlanSelection = async (tier: PlanTier, dbPlan: any) => {
    if (processingPlanId) return
    if (tier === 'enterprise') {
      // For enterprise, redirect to contact
      window.location.href = '/contact'
      return
    }
    if (!dbPlan) {
      setError("This plan is not yet available. Please contact support.")
      return
    }

    try {
      setProcessingPlanId(dbPlan.id)
      setError(null)

      const billingPeriod = billingCycle === "annual" ? "yearly" : "monthly"
      logger.debug("Processing plan:", tier, "billing:", billingPeriod)

      if (currentSubscription && currentSubscription.status === "active") {
        const isUpgradeToAnnual = currentSubscription.billing_cycle === "monthly" && billingPeriod === "yearly"
        const result = await changePlan(dbPlan.id, billingPeriod)

        if (result.scheduledChange && isUpgradeToAnnual) {
          alert("Success! Your plan will change to annual billing at the end of your current billing period.")
        } else {
          alert("Your plan has been updated successfully!")
        }
        window.location.reload()
      } else {
        const checkoutUrl = await createCheckoutSession(dbPlan.id, billingPeriod)
        if (!checkoutUrl) throw new Error("No checkout URL returned")
        window.location.href = checkoutUrl
      }
    } catch (error: any) {
      logger.error("Failed to process plan selection:", error)
      if (error.message?.includes("STRIPE_NOT_CONFIGURED")) {
        setError("Billing is not yet configured. Please contact support.")
      } else {
        setError(error.message || "An error occurred. Please try again.")
      }
    } finally {
      setProcessingPlanId(null)
    }
  }

  const togglePlanExpansion = (tier: PlanTier) => {
    setExpandedPlanId(expandedPlanId === tier ? null : tier)
  }

  const currentTier = currentSubscription?.plan?.name
    ? mapPlanNameToTier(currentSubscription.plan.name)
    : 'free'

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
        {/* Billing Cycle Toggle */}
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
            {billingCycle === "monthly" ? "Billed monthly" : "Billed annually (2 months free)"}. Cancel anytime.
          </p>
        </div>

        {/* Plans Grid - All 5 tiers */}
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 ${isModal ? 'gap-4' : 'gap-4'}`}>
          {tiers.map((tier) => {
            const dbPlan = getPlanByTier(tier)
            return (
              <PlanCard
                key={tier}
                tier={tier}
                dbPlan={dbPlan}
                billingCycle={billingCycle}
                isCurrentPlan={currentTier === tier}
                isProcessing={dbPlan ? processingPlanId === dbPlan.id : false}
                isExpanded={expandedPlanId === tier}
                onToggleExpand={() => togglePlanExpansion(tier)}
                isDisabled={!hasStripeConfig && tier !== 'free' && tier !== 'enterprise'}
                onSelect={() => handlePlanSelection(tier, dbPlan)}
                isModal={isModal}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface PlanCardProps {
  tier: PlanTier
  dbPlan: any
  billingCycle: "monthly" | "annual"
  isCurrentPlan: boolean
  isProcessing: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  isDisabled: boolean
  onSelect: () => void
  isModal?: boolean
}

function PlanCard({
  tier,
  dbPlan,
  billingCycle,
  isCurrentPlan,
  isProcessing,
  isExpanded,
  onToggleExpand,
  isDisabled,
  onSelect,
  isModal = false
}: PlanCardProps) {
  const info = PLAN_INFO[tier]
  const features = PLAN_FEATURES[tier]
  const limits = PLAN_LIMITS[tier]

  const isPro = tier === 'pro'
  const isFree = tier === 'free'
  const isTeam = tier === 'team'
  const isBusiness = tier === 'business'
  const isEnterprise = tier === 'enterprise'
  const isPopular = info.popular

  const price = billingCycle === "annual" ? info.priceAnnual : info.price

  // Get icon for each tier
  const getTierIcon = () => {
    if (isFree) return null
    if (isPro) return <Sparkles className="w-4 h-4" />
    if (isTeam) return <Users className="w-4 h-4" />
    if (isBusiness) return <Building2 className="w-4 h-4" />
    if (isEnterprise) return <Crown className="w-4 h-4" />
    return null
  }

  return (
    <div className="relative h-full">
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-2.5 left-1/2 transform -translate-x-1/2 z-10">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-md flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            POPULAR
          </div>
        </div>
      )}

      <Card
        className={`relative rounded-2xl h-full transition-all duration-300 overflow-hidden ${
          isPopular
            ? "bg-gradient-to-b from-slate-800/90 to-slate-850/90 border-2 border-blue-500/50 shadow-2xl shadow-blue-950/30 hover:border-blue-500/70"
            : isFree
            ? "bg-slate-900/50 border border-slate-700/30 hover:border-slate-600/50"
            : "bg-slate-900/70 border border-slate-700/50 hover:border-slate-600/70"
        }`}
      >
        {/* Top highlight for Pro */}
        {isPopular && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-blue-400" />
        )}

        <CardContent className={`${isModal ? 'p-4' : 'p-6'} flex flex-col h-full`}>
          {/* Plan Header */}
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-2 mb-1">
              {getTierIcon()}
              <h3 className={`${isModal ? 'text-xl' : 'text-2xl'} font-bold text-white`}>
                {info.name}
              </h3>
            </div>
            <p className="text-xs text-slate-400">{info.description}</p>
          </div>

          {/* Price */}
          <div className="text-center mb-4 pb-4 border-b border-slate-800/50">
            {isEnterprise ? (
              <div className={`${isModal ? 'text-2xl' : 'text-3xl'} font-bold text-white`}>Custom</div>
            ) : (
              <>
                <div className="flex items-baseline justify-center gap-1">
                  <span className={`${isModal ? 'text-3xl' : 'text-4xl'} font-bold text-white`}>
                    ${price === 0 ? '0' : price.toFixed(price % 1 === 0 ? 0 : 2)}
                  </span>
                  <span className="text-sm text-slate-500">/mo</span>
                </div>
                {billingCycle === "annual" && !isFree && (
                  <p className="text-xs text-green-400 mt-1">
                    ${((info.price - info.priceAnnual) * 12).toFixed(0)} saved/year
                  </p>
                )}
              </>
            )}
          </div>

          {/* Key Limits */}
          <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
            <div className="bg-slate-800/50 rounded-lg p-2 text-center">
              <div className="text-blue-300 font-semibold">
                {limits.tasksPerMonth === -1 ? '∞' : limits.tasksPerMonth.toLocaleString()}
              </div>
              <div className="text-slate-500">tasks/mo</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2 text-center">
              <div className="text-blue-300 font-semibold">
                {limits.maxTeamMembers === -1 ? '∞' : limits.maxTeamMembers}
              </div>
              <div className="text-slate-500">members</div>
            </div>
          </div>

          {/* Features */}
          <div className="flex-grow">
            <div className="space-y-2">
              {features.slice(0, isExpanded ? features.length : 4).map((feature, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                  <span className="text-xs text-slate-300">{feature}</span>
                </div>
              ))}
            </div>

            {features.length > 4 && (
              <button
                onClick={onToggleExpand}
                className="text-xs text-slate-500 hover:text-slate-400 mt-3"
              >
                {isExpanded ? "Show less ↑" : `+${features.length - 4} more →`}
              </button>
            )}
          </div>

          {/* CTA Button */}
          <div className="mt-4 pt-4">
            <Button
              className={`w-full py-3 text-sm font-semibold transition-all ${
                isPopular && !isCurrentPlan
                  ? "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg"
                  : isCurrentPlan
                  ? "bg-slate-800/30 text-slate-500 cursor-default border border-slate-700/50"
                  : isEnterprise
                  ? "bg-purple-600/20 border border-purple-500/50 text-purple-300 hover:bg-purple-600/30"
                  : isFree && !isCurrentPlan
                  ? "bg-transparent border-2 border-slate-700 hover:bg-slate-800/50 text-slate-200"
                  : "bg-slate-800 hover:bg-slate-700 text-white"
              }`}
              disabled={isProcessing || isCurrentPlan || (isDisabled && !isEnterprise)}
              onClick={onSelect}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : isCurrentPlan ? (
                "Current Plan"
              ) : isEnterprise ? (
                "Contact Sales"
              ) : isFree ? (
                "Downgrade"
              ) : (
                `Upgrade to ${info.name}`
              )}
            </Button>

            {/* Overage info */}
            {info.overageRate && !isCurrentPlan && (
              <p className="text-xs text-center text-slate-500 mt-2">
                +${info.overageRate}/task overage
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
