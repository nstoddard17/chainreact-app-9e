"use client"

import React, { memo, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, X, Users, Building2, Sparkles } from "lucide-react"
import Link from "next/link"
import { PLAN_INFO, PLAN_FEATURES, PLAN_LIMITS, type PlanTier } from '@/lib/utils/plan-restrictions'

interface PricingCardProps {
  tier: PlanTier
  isAnnual: boolean
  isAuthenticated: boolean
}

const PricingCard = memo(({ tier, isAnnual, isAuthenticated }: PricingCardProps) => {
  const info = PLAN_INFO[tier] || PLAN_INFO.free
  const features = PLAN_FEATURES[tier] || PLAN_FEATURES.free
  const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.free

  const price = isAnnual ? info.priceAnnual : info.price
  const isPopular = info.popular
  const isEnterprise = tier === 'enterprise'
  const isFree = tier === 'free'

  const getButtonText = () => {
    if (isEnterprise) return 'Contact Sales'
    if (isFree) return isAuthenticated ? 'Current Plan' : 'Get Started Free'
    return isAuthenticated ? 'Upgrade Now' : 'Start Free Trial'
  }

  const getButtonHref = () => {
    if (isEnterprise) return '/contact'
    if (isAuthenticated) return '/settings/billing'
    return '/auth/register'
  }

  return (
    <Card className={`relative p-6 bg-white/5 backdrop-blur-sm border transition-all duration-300 transform hover:scale-[1.02] flex flex-col h-full ${
      isPopular
        ? 'border-blue-500/50 ring-2 ring-blue-500/30 bg-gradient-to-b from-blue-950/30 to-transparent'
        : 'border-white/10 hover:bg-white/10'
    }`}>
      {isPopular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <Badge className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0 px-3 py-1">
            <Sparkles className="w-3 h-3 mr-1" />
            Most Popular
          </Badge>
        </div>
      )}

      <CardContent className="p-0 text-center flex flex-col flex-grow">
        {/* Plan Name */}
        <h3 className="text-xl font-bold text-white mb-1">{info.name}</h3>
        <p className="text-sm text-blue-200/70 mb-4">{info.description}</p>

        {/* Price */}
        <div className="mb-6">
          {isEnterprise ? (
            <div className="text-3xl font-bold text-white">Custom</div>
          ) : (
            <>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-4xl font-bold text-white">${price === 0 ? '0' : price.toFixed(price % 1 === 0 ? 0 : 2)}</span>
                <span className="text-blue-200/70">/mo</span>
              </div>
              {isAnnual && !isFree && (
                <p className="text-xs text-green-400 mt-1">
                  Save ${((info.price - info.priceAnnual) * 12).toFixed(0)}/year
                </p>
              )}
            </>
          )}
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
          <div className="bg-white/5 rounded-lg p-2">
            <div className="text-blue-300 font-semibold">
              {limits.tasksPerMonth === -1 ? 'Unlimited' : limits.tasksPerMonth.toLocaleString()}
            </div>
            <div className="text-blue-200/50">tasks/mo</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2">
            <div className="text-blue-300 font-semibold">
              {limits.maxTeamMembers === -1 ? 'Unlimited' : limits.maxTeamMembers}
            </div>
            <div className="text-blue-200/50">team members</div>
          </div>
        </div>

        {/* Features */}
        <ul className="space-y-2 mb-6 text-left flex-grow">
          {features.slice(0, 6).map((feature, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
              <span className="text-blue-200">{feature}</span>
            </li>
          ))}
        </ul>

        {/* CTA Button */}
        <Link href={getButtonHref()} className="mt-auto">
          <Button className={`w-full text-white transition-all duration-300 ${
            isPopular
              ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-lg shadow-blue-500/25'
              : isFree
              ? 'bg-white/10 hover:bg-white/20 border border-white/20'
              : 'bg-white/10 hover:bg-white/20 border border-white/20'
          }`}>
            {getButtonText()}
          </Button>
        </Link>

        {/* Overage Info */}
        {info.overageRate && (
          <p className="text-xs text-blue-200/50 mt-3">
            +${info.overageRate}/task overage
          </p>
        )}
      </CardContent>
    </Card>
  )
})

PricingCard.displayName = 'PricingCard'

// Feature comparison table data
const COMPARISON_FEATURES = [
  { name: 'Tasks per month', key: 'tasksPerMonth' },
  { name: 'Active workflows', key: 'maxActiveWorkflows' },
  { name: 'Team members', key: 'maxTeamMembers' },
  { name: 'AI Agents', key: 'aiAgents' },
  { name: 'Premium integrations', key: 'premiumIntegrations' },
  { name: 'Webhooks', key: 'webhooks' },
  { name: 'Scheduling', key: 'scheduling' },
  { name: 'Team sharing', key: 'teamSharing' },
  { name: 'Shared workspaces', key: 'sharedWorkspaces' },
  { name: 'Advanced analytics', key: 'advancedAnalytics' },
  { name: 'History retention', key: 'historyRetentionDays' },
  { name: 'Priority support', key: 'prioritySupport' },
  { name: 'Dedicated support', key: 'dedicatedSupport' },
  { name: 'SSO/SAML', key: 'sso' },
  { name: 'SLA guarantee', key: 'slaGuarantee' },
]

const formatValue = (value: any, key: string): React.ReactNode => {
  if (typeof value === 'boolean') {
    return value
      ? <CheckCircle className="h-5 w-5 text-green-400 mx-auto" />
      : <X className="h-5 w-5 text-slate-600 mx-auto" />
  }
  if (value === -1) return 'Unlimited'
  if (value === null) return <X className="h-5 w-5 text-slate-600 mx-auto" />
  if (key === 'historyRetentionDays') {
    if (value === 7) return '7 days'
    if (value === 30) return '30 days'
    if (value === 90) return '90 days'
    if (value === 365) return '1 year'
    return `${value} days`
  }
  if (typeof value === 'number') return value.toLocaleString()
  return value
}

const LandingPricing = memo(({ isAuthenticated }: { isAuthenticated: boolean }) => {
  const [isAnnual, setIsAnnual] = useState(true)
  const [showComparison, setShowComparison] = useState(false)

  const tiers: PlanTier[] = ['free', 'pro', 'team', 'business', 'enterprise']

  return (
    <section id="pricing" className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 md:py-24">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <Badge variant="secondary" className="bg-blue-600/20 text-blue-300 border border-blue-500/30 mb-4">
            Pricing
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-xl text-blue-200 max-w-2xl mx-auto mb-8">
            Start free and scale as you grow. No hidden fees, cancel anytime.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-3 bg-slate-900/50 p-1 rounded-full border border-slate-700">
            <button
              onClick={() => setIsAnnual(false)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                !isAnnual
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                isAnnual
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Annual
              <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
                Save 17%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-3 mb-12">
          {tiers.map((tier) => (
            <PricingCard
              key={tier}
              tier={tier}
              isAnnual={isAnnual}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </div>

        {/* Compare Plans Link */}
        <div className="text-center mb-8">
          <button
            onClick={() => setShowComparison(!showComparison)}
            className="text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors"
          >
            {showComparison ? 'Hide comparison' : 'Compare all features'}
          </button>
        </div>

        {/* Feature Comparison Table */}
        {showComparison && (
          <div className="overflow-x-auto bg-slate-900/50 rounded-2xl border border-slate-700/50 p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-4 px-4 text-blue-200 font-medium">Feature</th>
                  {tiers.map((tier) => (
                    <th key={tier} className="text-center py-4 px-2 text-white font-bold">
                      {PLAN_INFO[tier].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_FEATURES.map((feature, idx) => (
                  <tr key={feature.key} className={idx % 2 === 0 ? 'bg-slate-800/20' : ''}>
                    <td className="py-3 px-4 text-blue-200">{feature.name}</td>
                    {tiers.map((tier) => (
                      <td key={tier} className="py-3 px-2 text-center text-slate-300">
                        {formatValue(PLAN_LIMITS[tier][feature.key as keyof typeof PLAN_LIMITS.free], feature.key)}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Pricing row */}
                <tr className="border-t border-slate-700 bg-slate-800/40">
                  <td className="py-4 px-4 text-blue-200 font-medium">Monthly price</td>
                  {tiers.map((tier) => (
                    <td key={tier} className="py-4 px-2 text-center text-white font-bold">
                      {tier === 'enterprise' ? 'Custom' : `$${PLAN_INFO[tier].price}`}
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-800/40">
                  <td className="py-4 px-4 text-blue-200 font-medium">Annual price (per month)</td>
                  {tiers.map((tier) => (
                    <td key={tier} className="py-4 px-2 text-center text-green-400 font-bold">
                      {tier === 'enterprise' || tier === 'free' ? '-' : `$${PLAN_INFO[tier].priceAnnual.toFixed(2)}`}
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-800/40">
                  <td className="py-4 px-4 text-blue-200 font-medium">Overage rate</td>
                  {tiers.map((tier) => (
                    <td key={tier} className="py-4 px-2 text-center text-slate-400">
                      {PLAN_INFO[tier].overageRate ? `$${PLAN_INFO[tier].overageRate}/task` : '-'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* FAQ / Trust Section */}
        <div className="mt-16 text-center">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <h4 className="text-white font-semibold mb-1">No hidden fees</h4>
              <p className="text-blue-200/70 text-sm">Transparent pricing with no surprises</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mb-3">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
              <h4 className="text-white font-semibold mb-1">Cancel anytime</h4>
              <p className="text-blue-200/70 text-sm">No long-term contracts required</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mb-3">
                <Building2 className="w-6 h-6 text-purple-400" />
              </div>
              <h4 className="text-white font-semibold mb-1">Enterprise ready</h4>
              <p className="text-blue-200/70 text-sm">SOC2, SSO, and custom contracts</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
})

LandingPricing.displayName = 'LandingPricing'

export default LandingPricing
