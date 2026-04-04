"use client"

import React from 'react'
import { Check, ArrowRight } from 'lucide-react'

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    features: [
      "100 tasks/month",
      "Unlimited AI building",
      "35+ integrations",
      "7-day execution history",
    ],
    cta: "Get started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/mo",
    features: [
      "750 tasks/month",
      "AI Agent nodes",
      "30-day execution history",
      "Email support",
    ],
    cta: "Get started",
    highlighted: true,
    badge: "Most popular",
  },
  {
    name: "Team",
    price: "$49",
    period: "/mo",
    features: [
      "2,000 tasks/month",
      "5 team members",
      "Shared workspaces",
      "90-day execution history",
      "Priority support",
    ],
    cta: "Get started",
    highlighted: false,
  },
]

export function PricingPreview() {
  return (
    <section id="pricing" className="bg-white py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            Simple, transparent pricing
          </h2>
          <p className="mt-3 text-lg text-slate-500">
            Start free. Scale when you&apos;re ready.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white border rounded-xl p-6 flex flex-col ${
                plan.highlighted
                  ? "ring-2 ring-orange-500 border-orange-500"
                  : "border-slate-200"
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                  {plan.badge}
                </span>
              )}

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-900">
                  {plan.name}
                </h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-slate-900">
                    {plan.price}
                  </span>
                  <span className="text-sm text-slate-500">{plan.period}</span>
                </div>
              </div>

              <ul className="flex-1 space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                    <span className="text-sm text-slate-600">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  plan.highlighted
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : "border border-slate-200 text-slate-900 hover:bg-slate-50"
                }`}
              >
                {plan.cta}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
