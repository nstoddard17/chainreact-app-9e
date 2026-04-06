"use client"

import React from 'react'
import Link from 'next/link'
import { Check, ArrowRight } from 'lucide-react'
import { PLAN_INFO, PLAN_FEATURES } from '@/lib/utils/plan-restrictions'
import type { PlanTier } from '@/lib/utils/plan-restrictions'

interface PricingCard {
  tier: PlanTier
  highlighted: boolean
  badge?: string
}

const displayPlans: PricingCard[] = [
  { tier: 'free', highlighted: false },
  { tier: 'pro', highlighted: true, badge: 'Most popular' },
  { tier: 'team', highlighted: false },
]

export function PricingPreview() {
  return (
    <section id="pricing" className="bg-slate-950 py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Simple, transparent pricing
          </h2>
          <p className="mt-3 text-lg text-slate-400">
            Start free. Scale when you&apos;re ready.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {displayPlans.map(({ tier, highlighted, badge }) => {
            const info = PLAN_INFO[tier]
            const features = (PLAN_FEATURES[tier] ?? []).filter(
              (f) => !f.startsWith('Everything in')
            )
            const showAnnual = info.price > 0

            return (
              <div
                key={tier}
                className={`relative bg-slate-900 border rounded-xl p-6 flex flex-col ${
                  highlighted
                    ? "ring-2 ring-orange-500 border-orange-500"
                    : "border-slate-800"
                }`}
              >
                {badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                    {badge}
                  </span>
                )}

                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-white">
                    {info.name}
                  </h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    {showAnnual && (
                      <span className="text-lg text-slate-500 line-through mr-1">
                        ${info.price}
                      </span>
                    )}
                    <span className="text-4xl font-bold tracking-tight text-white">
                      ${showAnnual ? info.priceAnnual : info.price}
                    </span>
                    <span className="text-sm text-slate-500">/mo</span>
                  </div>
                  {showAnnual && (
                    <p className="text-xs text-green-400 mt-1">
                      Billed annually (save ${((info.price - info.priceAnnual) * 12).toFixed(0)}/yr)
                    </p>
                  )}
                </div>

                <ul className="flex-1 space-y-3 mb-8">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                      <span className="text-sm text-slate-400">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    highlighted
                      ? "bg-white text-slate-900 hover:bg-slate-100"
                      : "border border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>

        <div className="text-center mt-8">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-orange-400 transition-colors"
          >
            Compare all plans in detail
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
