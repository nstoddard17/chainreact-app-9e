"use client"

import { useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Check, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

const plans = [
  {
    name: "Free",
    price: { monthly: 0, yearly: 0 },
    description: "Free forever",
    cta: null,
    features: [
      "100 requests/mo",
      "2 connections",
      "1 team",
      "3 team members",
      "7-day history",
      "Email Notifications",
      "Community Support",
    ],
    additionalLabel: null,
  },
  {
    name: "Pro",
    price: { monthly: 20, yearly: 16 },
    description: "Billed yearly",
    billingNote: "Annual package of credits",
    cta: "Buy yearly plan",
    highlight: false,
    features: [
      "Unlimited requests/mo",
      "15 connections",
      "5 teams",
      "15 team members",
      "90-day history",
      "Custom Email Branding",
      "Slack Notifications",
      "Webhook Notifications",
      "Rules Engine",
    ],
    additionalLabel: "ADDITIONALLY TO FREE",
  },
  {
    name: "Business",
    price: { monthly: 60, yearly: 48 },
    description: "Billed yearly",
    billingNote: "Annual package of credits",
    cta: "Buy yearly plan",
    highlight: false,
    features: [
      "Unlimited requests/mo",
      "Unlimited connections",
      "Unlimited teams",
      "Unlimited team members",
      "365-day history",
      "Analytics Export",
      "SSO / SAML",
      "Audit Log Export",
      "Multi-Step Approvals",
    ],
    additionalLabel: "ADDITIONALLY TO PRO",
  },
  {
    name: "Enterprise",
    price: null,
    description: "Custom",
    cta: "Talk to sales",
    ctaVariant: "outline" as const,
    highlight: true,
    features: [
      "Unlimited requests/mo",
      "Unlimited connections",
      "Unlimited teams",
      "Unlimited team members",
      "Unlimited history",
      "Dedicated Support",
      "Custom SLA",
      "Priority Processing",
      "SCIM Provisioning",
    ],
    additionalLabel: "ADDITIONALLY TO BUSINESS",
  },
]

const comparisonRows = [
  { feature: "Requests per month", free: "100", pro: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
  { feature: "Connections", free: "2", pro: "15", business: "Unlimited", enterprise: "Unlimited" },
  { feature: "Teams", free: "1", pro: "5", business: "Unlimited", enterprise: "Unlimited" },
  { feature: "Team members", free: "3", pro: "15", business: "Unlimited", enterprise: "Unlimited" },
  { feature: "History retention", free: "7 days", pro: "90 days", business: "365 days", enterprise: "Unlimited" },
  { feature: "Email Notifications", free: true, pro: true, business: true, enterprise: true },
  { feature: "Slack Notifications", free: false, pro: true, business: true, enterprise: true },
  { feature: "Webhook Notifications", free: false, pro: true, business: true, enterprise: true },
  { feature: "Custom Email Branding", free: false, pro: true, business: true, enterprise: true },
  { feature: "Rules Engine", free: false, pro: true, business: true, enterprise: true },
  { feature: "Analytics Export", free: false, pro: false, business: true, enterprise: true },
  { feature: "SSO / SAML", free: false, pro: false, business: true, enterprise: true },
  { feature: "Audit Log Export", free: false, pro: false, business: true, enterprise: true },
  { feature: "Multi-Step Approvals", free: false, pro: false, business: true, enterprise: true },
  { feature: "Dedicated Support", free: false, pro: false, business: false, enterprise: true },
  { feature: "Custom SLA", free: false, pro: false, business: false, enterprise: true },
  { feature: "Priority Processing", free: false, pro: false, business: false, enterprise: true },
  { feature: "SCIM Provisioning", free: false, pro: false, business: false, enterprise: true },
]

export default function SubscriptionPage() {
  const { profile } = useAuthStore()
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly")

  const currentPlan = profile?.plan || "free"
  const tasksUsed = profile?.tasks_used ?? 0
  const tasksLimit = profile?.tasks_limit ?? 100
  const tasksPercent = Math.min((tasksUsed / tasksLimit) * 100, 100)

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Subscription</h1>

      {/* Current Plan Summary */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            <tr>
              <td className="px-6 py-4 text-gray-500 dark:text-gray-400 w-40">My plan</td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800 capitalize">
                    {currentPlan}
                  </Badge>
                  <span className="text-gray-600 dark:text-gray-300">{tasksLimit} requests/month</span>
                </div>
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-gray-500 dark:text-gray-400">Billing</td>
              <td className="px-6 py-4 text-gray-900 dark:text-gray-100">$0.00 billed monthly</td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-gray-500 dark:text-gray-400">Requests</td>
              <td className="px-6 py-4">
                <div className="space-y-1.5">
                  <span className="text-gray-900 dark:text-gray-100">{tasksUsed} / {tasksLimit} used ({Math.round(tasksPercent)}%)</span>
                  <div className="w-64 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        tasksPercent > 90 ? "bg-red-500" : tasksPercent > 70 ? "bg-amber-500" : "bg-orange-500"
                      )}
                      style={{ width: `${tasksPercent}%` }}
                    />
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-gray-500 dark:text-gray-400">Connections</td>
              <td className="px-6 py-4 text-gray-900 dark:text-gray-100">0 / 2 active</td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-gray-500 dark:text-gray-400">Teams</td>
              <td className="px-6 py-4 text-gray-900 dark:text-gray-100">1 / 1 teams</td>
            </tr>
            <tr>
              <td className="px-6 py-4 text-gray-500 dark:text-gray-400">Members</td>
              <td className="px-6 py-4 text-gray-900 dark:text-gray-100">1 / 3 members</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Compare Plans */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Compare Plans</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className={cn("text-gray-500", billingCycle === "monthly" && "text-gray-900 dark:text-gray-100 font-medium")}>
              Monthly
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === "monthly" ? "yearly" : "monthly")}
              className={cn(
                "relative w-10 h-5 rounded-full transition-colors",
                billingCycle === "yearly" ? "bg-orange-500" : "bg-gray-300 dark:bg-gray-600"
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                  billingCycle === "yearly" ? "translate-x-5" : "translate-x-0.5"
                )}
              />
            </button>
            <span className={cn("text-gray-500", billingCycle === "yearly" && "text-gray-900 dark:text-gray-100 font-medium")}>
              Yearly <span className="text-orange-500 font-medium">(Save 15%+)</span>
            </span>
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const isCurrentPlan = plan.name.toLowerCase() === currentPlan
            const price = plan.price ? plan.price[billingCycle] : null

            return (
              <div
                key={plan.name}
                className={cn(
                  "rounded-lg border p-6 flex flex-col",
                  plan.highlight
                    ? "bg-gray-900 dark:bg-gray-800 text-white border-gray-700"
                    : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800",
                  isCurrentPlan && !plan.highlight && "ring-2 ring-orange-500 border-orange-500"
                )}
              >
                {isCurrentPlan && (
                  <div className="flex justify-center -mt-9 mb-3">
                    <span className="bg-orange-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                      Your plan
                    </span>
                  </div>
                )}

                <h3 className={cn("text-lg font-semibold", plan.highlight ? "text-white" : "text-gray-900 dark:text-gray-100")}>
                  {plan.name}
                </h3>

                {price !== null ? (
                  <div className="mt-2">
                    <span className={cn("text-3xl font-bold", plan.highlight ? "text-white" : "text-gray-900 dark:text-gray-100")}>
                      ${price}
                    </span>
                    {price > 0 && (
                      <span className={cn("text-sm", plan.highlight ? "text-gray-300" : "text-gray-500")}>
                        .00 /mo
                      </span>
                    )}
                    <p className={cn("text-sm mt-0.5", plan.highlight ? "text-gray-400" : "text-gray-500")}>
                      {price === 0 ? "Free forever" : plan.description}
                    </p>
                    {plan.billingNote && (
                      <p className={cn("text-xs", plan.highlight ? "text-gray-400" : "text-gray-400")}>
                        {plan.billingNote}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-white">Custom</span>
                  </div>
                )}

                <div className="mt-4 flex-1">
                  {isCurrentPlan && !plan.cta ? (
                    <p className={cn("text-sm text-center py-2", plan.highlight ? "text-gray-400" : "text-gray-400")}>
                      Your current plan
                    </p>
                  ) : plan.cta ? (
                    <Button
                      className={cn(
                        "w-full",
                        plan.highlight
                          ? "bg-white text-gray-900 hover:bg-gray-100"
                          : plan.ctaVariant === "outline"
                            ? ""
                            : "bg-orange-500 hover:bg-orange-600 text-white"
                      )}
                      variant={plan.ctaVariant || "default"}
                    >
                      {plan.cta}
                    </Button>
                  ) : null}
                </div>

                {plan.additionalLabel && (
                  <p className={cn(
                    "text-[10px] font-semibold tracking-wider uppercase mt-4 mb-2",
                    plan.highlight ? "text-gray-400" : "text-gray-400"
                  )}>
                    {plan.additionalLabel}
                  </p>
                )}

                {!plan.additionalLabel && (
                  <p className={cn(
                    "text-[10px] font-semibold tracking-wider uppercase mt-4 mb-2",
                    plan.highlight ? "text-gray-400" : "text-gray-400"
                  )}>
                    FREE PLAN FEATURES
                  </p>
                )}

                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className={cn(
                        "h-4 w-4 mt-0.5 shrink-0",
                        plan.highlight ? "text-green-400" : "text-orange-500"
                      )} />
                      <span className={plan.highlight ? "text-gray-200" : "text-gray-700 dark:text-gray-300"}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      {/* Comparison Table */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Comparison table</h2>

        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left px-6 py-3 text-gray-500 dark:text-gray-400 font-medium w-1/3" />
                <th className="text-center px-4 py-3 text-gray-900 dark:text-gray-100 font-semibold">
                  <div className="space-y-0.5">
                    <div>Free</div>
                    {currentPlan === "free" && (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px]">
                        Your plan
                      </Badge>
                    )}
                  </div>
                </th>
                <th className="text-center px-4 py-3 text-gray-900 dark:text-gray-100 font-semibold">Pro</th>
                <th className="text-center px-4 py-3 text-gray-900 dark:text-gray-100 font-semibold">Business</th>
                <th className="text-center px-4 py-3 text-gray-900 dark:text-gray-100 font-semibold">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {comparisonRows.map((row) => (
                <tr key={row.feature} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-3 text-gray-700 dark:text-gray-300">{row.feature}</td>
                  {(["free", "pro", "business", "enterprise"] as const).map((tier) => {
                    const value = row[tier]
                    return (
                      <td key={tier} className="px-4 py-3 text-center">
                        {typeof value === "boolean" ? (
                          value ? (
                            <Check className="h-4 w-4 text-orange-500 mx-auto" />
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">-</span>
                          )
                        ) : (
                          <span className="text-gray-900 dark:text-gray-100 font-medium">{value}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
