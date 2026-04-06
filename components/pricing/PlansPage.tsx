"use client"

import React, { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  Check,
  X,
  ArrowRight,
  Sparkles,
  Users,
  Building2,
  Crown,
  Zap,
  Bot,
  Shield,
  BarChart3,
  Clock,
  MessageSquare,
  Webhook,
  Key,
  Brain,
  RefreshCw,
  Eye,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { usePlansStore } from "@/stores/plansStore"
import { TempFooter } from "@/components/temp-landing/TempFooter"

type BillingCycle = "monthly" | "annual"

interface PlanTierConfig {
  tier: string
  icon: React.ReactNode
  badge?: string
  highlighted?: boolean
  cta: string
  ctaHref: string
  limits: {
    tasks: string
    aiBuilds: string
    activeWorkflows: string
    integrations: string
    history: string
    teamMembers: string
  }
  features: string[]
  aiFeatures: string[]
  comingSoon?: string[]
}

const plans: PlanTierConfig[] = [
  {
    tier: "free",
    icon: <Zap className="h-5 w-5" />,
    cta: "Get started free",
    ctaHref: "/auth/register",
    limits: {
      tasks: "300/month",
      aiBuilds: "5/month",
      activeWorkflows: "3",
      integrations: "3 connected",
      history: "7 days",
      teamMembers: "1",
    },
    features: [
      "Visual drag-and-drop builder",
      "AI workflow builder (5 builds/mo)",
      "Unlimited refinements on builds",
      "35+ integrations (connect 3)",
      "Webhook & schedule triggers",
      "Conditional logic & branching",
      "Template gallery (browse & use)",
      "Execution monitoring (last 3 runs)",
      "Error notifications",
      "AI learns from your corrections",
      "7-day execution history",
      "Community support",
    ],
    aiFeatures: [
      "AI builds workflows from description",
      "AI auto-configures fields",
      "AI runtime field generation",
      "Correction memory (kept forever)",
    ],
  },
  {
    tier: "pro",
    icon: <Sparkles className="h-5 w-5" />,
    badge: "Most popular",
    highlighted: true,
    cta: "Start Pro",
    ctaHref: "/auth/register?plan=pro",
    limits: {
      tasks: "3,000/month",
      aiBuilds: "Unlimited",
      activeWorkflows: "Unlimited",
      integrations: "Unlimited",
      history: "30 days",
      teamMembers: "1",
    },
    features: [
      "Everything in Free, plus:",
      "Unlimited AI workflow builds",
      "Unlimited active workflows",
      "All integrations (unlimited)",
      "Full detailed execution logs",
      "30-day execution history",
      "Re-run failed executions",
      "Integration health dashboard",
      "15 AI context entries",
      "Template publishing",
      "1 custom webhook",
      "1 API key",
      "$0.025/task overage",
      "Email support",
    ],
    aiFeatures: [
      "Everything in Free, plus:",
      "AI decision logs (see AI reasoning)",
      "Optimization suggestions",
      "Basic natural language monitoring",
    ],
    comingSoon: [
      "Optimization suggestions",
      "Natural language monitoring",
    ],
  },
  {
    tier: "team",
    icon: <Users className="h-5 w-5" />,
    cta: "Start Team",
    ctaHref: "/auth/register?plan=team",
    limits: {
      tasks: "10,000/month",
      aiBuilds: "Unlimited",
      activeWorkflows: "Unlimited",
      integrations: "Unlimited",
      history: "90 days",
      teamMembers: "Unlimited",
    },
    features: [
      "Everything in Pro, plus:",
      "Unlimited team members",
      "1 team",
      "Shared workspaces",
      "Real-time collaboration",
      "Workflow comments",
      "Role-based permissions",
      "Shared integration connections",
      "90-day execution history",
      "Unlimited AI context entries",
      "20 custom webhooks",
      "5 API keys",
      "Team analytics",
      "$0.02/task overage",
      "Priority support",
    ],
    aiFeatures: [
      "Everything in Pro, plus:",
      "Cross-workflow pattern analysis",
      "Shareable execution links",
      "Workflow dependency warnings",
      "Advanced monitoring rules",
    ],
    comingSoon: [
      "Cross-workflow pattern analysis",
      "Dependency warnings",
    ],
  },
  {
    tier: "business",
    icon: <Building2 className="h-5 w-5" />,
    cta: "Start Business",
    ctaHref: "/auth/register?plan=business",
    limits: {
      tasks: "30,000/month",
      aiBuilds: "Unlimited",
      activeWorkflows: "Unlimited",
      integrations: "Unlimited",
      history: "1 year",
      teamMembers: "Unlimited",
    },
    features: [
      "Everything in Team, plus:",
      "Unlimited teams",
      "Unlimited team members",
      "1-year execution history",
      "Unlimited custom webhooks",
      "15 API keys",
      "Audit logs",
      "99.9% SLA guarantee",
      "Workflow version diffing",
      "Advanced analytics & reporting",
      "$0.015/task overage",
      "Dedicated support",
    ],
    aiFeatures: [
      "Everything in Team, plus:",
      "Proactive improvement notifications",
      "Embeddable status widget",
    ],
    comingSoon: [
      "Proactive improvement notifications",
      "Embeddable status widget",
    ],
  },
  {
    tier: "enterprise",
    icon: <Crown className="h-5 w-5" />,
    cta: "Contact sales",
    ctaHref: "/contact",
    limits: {
      tasks: "Unlimited",
      aiBuilds: "Unlimited",
      activeWorkflows: "Unlimited",
      integrations: "Unlimited",
      history: "Unlimited",
      teamMembers: "Unlimited",
    },
    features: [
      "Everything in Business, plus:",
      "Unlimited tasks",
      "Unlimited members & teams",
      "SSO/SAML authentication",
      "Custom contracts & invoicing",
      "99.99% SLA guarantee",
      "Data residency options",
      "Dedicated success manager",
      "Custom integrations",
      "Onboarding & training",
      "Volume discounts",
    ],
    aiFeatures: [
      "Everything in Business, plus:",
      "Custom AI model configuration",
      "Dedicated infrastructure",
    ],
  },
]

function PlanCard({
  plan,
  billingCycle,
}: {
  plan: PlanTierConfig
  billingCycle: BillingCycle
}) {
  const planData = usePlansStore(s => s.getPlan(plan.tier))
  const priceMonthly = planData?.priceMonthly ?? 0
  const priceAnnual = planData?.priceAnnual ?? 0
  const displayName = planData?.displayName ?? plan.tier
  const description = planData?.description ?? ''
  const price = billingCycle === "annual" ? priceAnnual : priceMonthly
  const isEnterprise = plan.tier === "enterprise"
  const isAnnual = billingCycle === "annual"
  const showSavings = isAnnual && !isEnterprise && priceMonthly > 0

  return (
    <div className="relative flex flex-col h-full">
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="bg-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
            {plan.badge}
          </span>
        </div>
      )}

      <div
        className={`flex flex-col h-full rounded-2xl border p-6 transition-all ${
          plan.highlighted
            ? "ring-2 ring-orange-500 border-orange-500 bg-slate-900/80"
            : "border-slate-800 bg-slate-900/50"
        }`}
      >
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-orange-400">{plan.icon}</span>
            <h3 className="text-lg font-semibold text-white">{displayName}</h3>
          </div>
          <p className="text-xs text-slate-400">{description}</p>
        </div>

        {/* Price */}
        <div className="mb-5 pb-5 border-b border-slate-800">
          {isEnterprise ? (
            <div className="text-3xl font-bold text-white">Custom</div>
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                {showSavings && (
                  <span className="text-lg text-slate-500 line-through mr-1">
                    ${priceMonthly}
                  </span>
                )}
                <span className="text-4xl font-bold text-white">
                  ${price === 0 ? "0" : price % 1 === 0 ? price : price.toFixed(2)}
                </span>
                <span className="text-sm text-slate-500">/mo</span>
              </div>
              {showSavings ? (
                <p className="text-xs text-green-400 mt-1">
                  Billed annually (save ${((priceMonthly - priceAnnual) * 12).toFixed(0)}/year)
                </p>
              ) : priceMonthly > 0 ? (
                <p className="text-xs text-slate-500 mt-1">Billed monthly</p>
              ) : null}
            </>
          )}
        </div>

        {/* Key limits grid */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <LimitBadge label="Tasks" value={plan.limits.tasks} />
          <LimitBadge label="AI Builds" value={plan.limits.aiBuilds} />
          <LimitBadge label="Workflows" value={plan.limits.activeWorkflows} />
          <LimitBadge label="History" value={plan.limits.history} />
          <LimitBadge label="Integrations" value={plan.limits.integrations} />
          <LimitBadge label="Members" value={plan.limits.teamMembers} />
        </div>

        {/* Features */}
        <div className="flex-1 space-y-2 mb-6">
          {plan.features.map((feature) => (
            <div key={feature} className="flex items-start gap-2">
              <Check className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
              <span className="text-xs text-slate-300">{feature}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Link
          href={plan.ctaHref}
          className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            plan.highlighted
              ? "bg-orange-500 text-white hover:bg-orange-400"
              : isEnterprise
                ? "bg-slate-700 text-white hover:bg-slate-600"
                : "border border-slate-700 text-slate-300 hover:bg-slate-800"
          }`}
        >
          {plan.cta}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}

function LimitBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/60 rounded-lg px-2 py-1.5 text-center">
      <div className="text-xs font-semibold text-orange-400">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  )
}

/* ---------- Feature comparison table ---------- */

interface ComparisonCategory {
  name: string
  icon: React.ReactNode
  rows: ComparisonRow[]
}

interface ComparisonRow {
  feature: string
  tooltip?: string
  free: string | boolean
  pro: string | boolean
  team: string | boolean
  business: string | boolean
  enterprise: string | boolean
}

const comparisonData: ComparisonCategory[] = [
  {
    name: "Workflow Building",
    icon: <Bot className="h-4 w-4" />,
    rows: [
      { feature: "Visual drag-and-drop builder", free: true, pro: true, team: true, business: true, enterprise: true },
      { feature: "AI workflow builder", free: "5/month", pro: "Unlimited", team: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
      { feature: "Conversational refinements", free: "Unlimited", pro: "Unlimited", team: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
      { feature: "Conditional logic & branching", free: true, pro: true, team: true, business: true, enterprise: true },
      { feature: "Template gallery", free: "Browse & use", pro: "Use & publish", team: "Use & publish", business: "Use & publish", enterprise: "Use & publish" },
      { feature: "Workflow versioning", free: "Last 5", pro: "Last 20", team: "Last 50", business: "All", enterprise: "All" },
    ],
  },
  {
    name: "Execution & Monitoring",
    icon: <Eye className="h-4 w-4" />,
    rows: [
      { feature: "Tasks per month", free: "300", pro: "3,000", team: "10,000", business: "30,000", enterprise: "Unlimited" },
      { feature: "Active workflows", free: "3", pro: "Unlimited", team: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
      { feature: "Execution history", free: "7 days", pro: "30 days", team: "90 days", business: "1 year", enterprise: "Unlimited" },
      { feature: "Detailed execution logs", free: "Last 3 runs", pro: true, team: true, business: true, enterprise: true },
      { feature: "Real-time monitoring", free: true, pro: true, team: true, business: true, enterprise: true },
      { feature: "Re-run failed executions", free: false, pro: true, team: true, business: true, enterprise: true },
      { feature: "Loop max iterations", free: "10", pro: "100", team: "500", business: "500", enterprise: "Unlimited" },
      { feature: "Task overage", free: "Hard cap", pro: "$0.025/task", team: "$0.02/task", business: "$0.015/task", enterprise: "Custom" },
    ],
  },
  {
    name: "Integrations & API",
    icon: <Webhook className="h-4 w-4" />,
    rows: [
      { feature: "Available integrations", free: "35+", pro: "35+", team: "35+", business: "35+", enterprise: "35+ & custom" },
      { feature: "Connected integrations", free: "3", pro: "Unlimited", team: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
      { feature: "Webhook triggers", free: true, pro: true, team: true, business: true, enterprise: true },
      { feature: "Custom webhooks", free: "1", pro: "5", team: "20", business: "Unlimited", enterprise: "Unlimited" },
      { feature: "API keys", free: false, pro: "1", team: "5", business: "15", enterprise: "Unlimited" },
      { feature: "Integration health dashboard", free: false, pro: true, team: true, business: true, enterprise: true },
    ],
  },
  {
    name: "AI Intelligence",
    icon: <Brain className="h-4 w-4" />,
    rows: [
      { feature: "AI field generation (runtime)", free: true, pro: true, team: true, business: true, enterprise: true },
      { feature: "AI learns from corrections", free: true, pro: true, team: true, business: true, enterprise: true },
      { feature: "Correction memory", free: "Kept forever", pro: "Kept forever", team: "Kept forever", business: "Kept forever", enterprise: "Kept forever" },
      { feature: "AI context entries", free: "1", pro: "15", team: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
      { feature: "AI decision logs", free: false, pro: true, team: true, business: true, enterprise: true },
      { feature: "Optimization suggestions", free: false, pro: true, team: true, business: true, enterprise: true },
      { feature: "Cross-workflow learning", free: false, pro: false, team: true, business: true, enterprise: true },
      { feature: "Proactive improvements", free: false, pro: false, team: false, business: true, enterprise: true },
    ],
  },
  {
    name: "Team & Collaboration",
    icon: <Users className="h-4 w-4" />,
    rows: [
      { feature: "Members", free: "1 (solo)", pro: "1 (solo)", team: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
      { feature: "Teams", free: false, pro: false, team: "1", business: "Unlimited", enterprise: "Unlimited" },
      { feature: "Shared workspaces", free: false, pro: false, team: true, business: true, enterprise: true },
      { feature: "Real-time collaboration", free: false, pro: false, team: true, business: true, enterprise: true },
      { feature: "Workflow comments", free: false, pro: false, team: true, business: true, enterprise: true },
      { feature: "Role-based permissions", free: false, pro: false, team: true, business: true, enterprise: true },
      { feature: "Shareable run links", free: false, pro: false, team: true, business: true, enterprise: true },
      { feature: "Team analytics", free: false, pro: false, team: true, business: true, enterprise: true },
    ],
  },
  {
    name: "Security & Compliance",
    icon: <Shield className="h-4 w-4" />,
    rows: [
      { feature: "GDPR data deletion", free: true, pro: true, team: true, business: true, enterprise: true },
      { feature: "OAuth token auto-refresh", free: true, pro: true, team: true, business: true, enterprise: true },
      { feature: "Audit logs", free: false, pro: false, team: false, business: true, enterprise: true },
      { feature: "SSO/SAML", free: false, pro: false, team: false, business: false, enterprise: true },
      { feature: "SLA guarantee", free: false, pro: false, team: false, business: "99.9%", enterprise: "99.99%" },
      { feature: "Data residency options", free: false, pro: false, team: false, business: false, enterprise: true },
    ],
  },
  {
    name: "Support",
    icon: <MessageSquare className="h-4 w-4" />,
    rows: [
      { feature: "Community support", free: true, pro: true, team: true, business: true, enterprise: true },
      { feature: "Email support", free: false, pro: true, team: true, business: true, enterprise: true },
      { feature: "Priority support", free: false, pro: false, team: true, business: true, enterprise: true },
      { feature: "Dedicated support", free: false, pro: false, team: false, business: true, enterprise: true },
      { feature: "Dedicated success manager", free: false, pro: false, team: false, business: false, enterprise: true },
    ],
  },
]

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return <Check className="h-4 w-4 text-green-500 mx-auto" />
  }
  if (value === false) {
    return <X className="h-4 w-4 text-slate-600 mx-auto" />
  }
  return <span className="text-xs text-slate-300">{value}</span>
}

function ComparisonTable() {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(comparisonData.map((c) => c.name))
  )

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const tierHeaders = [
    { name: "Free", tier: "free" },
    { name: "Pro", tier: "pro" },
    { name: "Team", tier: "team" },
    { name: "Business", tier: "business" },
    { name: "Enterprise", tier: "enterprise" },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400 w-[240px]">
              Feature
            </th>
            {tierHeaders.map((h) => (
              <th
                key={h.tier}
                className={`text-center py-3 px-3 text-sm font-medium w-[100px] ${
                  h.tier === "pro" ? "text-orange-400" : "text-slate-400"
                }`}
              >
                {h.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparisonData.map((category) => {
            const isExpanded = expandedCategories.has(category.name)
            return (
              <React.Fragment key={category.name}>
                <tr
                  className="border-b border-slate-800/50 cursor-pointer hover:bg-slate-800/20"
                  onClick={() => toggleCategory(category.name)}
                >
                  <td
                    colSpan={6}
                    className="py-3 px-4"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-orange-400">{category.icon}</span>
                      <span className="text-sm font-semibold text-white">
                        {category.name}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-slate-500 ml-auto" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-500 ml-auto" />
                      )}
                    </div>
                  </td>
                </tr>
                {isExpanded &&
                  category.rows.map((row) => (
                    <tr
                      key={row.feature}
                      className="border-b border-slate-800/30 hover:bg-slate-800/10"
                    >
                      <td className="py-2.5 px-4 pl-10 text-xs text-slate-400">
                        {row.feature}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <CellValue value={row.free} />
                      </td>
                      <td className="py-2.5 px-3 text-center bg-orange-500/[0.03]">
                        <CellValue value={row.pro} />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <CellValue value={row.team} />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <CellValue value={row.business} />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <CellValue value={row.enterprise} />
                      </td>
                    </tr>
                  ))}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- FAQ ---------- */

const faqItems = [
  {
    q: "What counts as a task?",
    a: "Each action node that executes in a workflow counts as 1 task. Triggers are free (they just listen). Logic nodes (conditions, filters, delays) are free. AI nodes cost 1-5 tasks depending on the model used. Building workflows with AI is free - you only pay when workflows run.",
  },
  {
    q: "What counts as an AI build?",
    a: "An AI build is when you describe a new workflow from scratch and the AI generates it. Refinements (\"change the Slack channel\", \"add a filter step\") are free and unlimited on all plans - they don't count as builds.",
  },
  {
    q: "Does the AI really learn from my corrections?",
    a: "Yes. When you correct a field value, swap a node, or adjust configuration, the system remembers. Next time you build a similar workflow, the AI uses your past corrections to get it right the first time. This learning data is kept forever on all plans, including Free.",
  },
  {
    q: "What happens when I hit my task limit?",
    a: "On Free, workflows pause until your tasks reset next month. On paid plans, you can enable overage billing to keep running at the per-task rate shown on your plan. You'll always see your usage before running a workflow.",
  },
  {
    q: "Can I change plans anytime?",
    a: "Yes. Upgrade instantly, downgrade at the end of your billing cycle. Annual plans can switch to monthly. Your workflows, integrations, and AI learning data are never deleted when changing plans.",
  },
  {
    q: "What's the difference between Free and Pro for AI?",
    a: "Free gives you 5 AI workflow builds per month with unlimited refinements. Pro gives you unlimited AI builds, plus AI decision logs (see why the AI made each choice), optimization suggestions, and deeper monitoring. The AI learning from corrections works on all plans.",
  },
]

function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="max-w-3xl mx-auto space-y-2">
      {faqItems.map((item, i) => {
        const isOpen = openIndex === i
        return (
          <div
            key={i}
            className="border border-slate-800 rounded-lg overflow-hidden"
          >
            <button
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/30 transition-colors"
              onClick={() => setOpenIndex(isOpen ? null : i)}
            >
              <span className="text-sm font-medium text-white">{item.q}</span>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-slate-400 shrink-0 ml-4" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-4" />
              )}
            </button>
            {isOpen && (
              <div className="px-5 pb-4">
                <p className="text-sm text-slate-400 leading-relaxed">
                  {item.a}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Main page ---------- */

export function PlansPage() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual")
  const fetchPlans = usePlansStore(s => s.fetchPlans)

  // Fetch plans on mount (public page, no auth required)
  React.useEffect(() => { fetchPlans() }, [fetchPlans])

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo_transparent.png"
              alt="ChainReact"
              width={28}
              height={28}
              className="brightness-0 invert"
            />
            <span className="text-base font-semibold text-white">
              ChainReact
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/auth/login"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/auth/register"
              className="text-sm bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-400 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero - compact so plan cards are visible above the fold */}
      <section className="pt-8 pb-5 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
            Simple, transparent pricing
          </h1>
          <p className="mt-2 text-base text-slate-400 max-w-xl mx-auto">
            Start free with AI workflow building. Scale when you&apos;re ready.
          </p>

          {/* Billing toggle */}
          <div className="mt-5 inline-flex items-center gap-3 bg-slate-900 p-1 rounded-full border border-slate-800">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all ${
                billingCycle === "monthly"
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("annual")}
              className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                billingCycle === "annual"
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Annual
              <span className="bg-green-600 text-white text-[10px] px-2 py-0.5 rounded-full font-semibold">
                Save up to 19%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section className="px-6 pb-16">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
          {plans.map((plan) => (
            <PlanCard key={plan.tier} plan={plan} billingCycle={billingCycle} />
          ))}
        </div>
      </section>

      {/* AI learning callout */}
      <section className="px-6 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-orange-500/10 to-orange-600/5 border border-orange-500/20 rounded-2xl p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-orange-500/20 rounded-full p-3">
                <Brain className="h-6 w-6 text-orange-400" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              AI that gets smarter every time you use it
            </h3>
            <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
              Every correction you make teaches the system. Change a Slack
              channel? The AI remembers for next time. Swap a node? It learns
              your preference. This memory is kept forever on all plans -
              including Free - because it makes the AI better for everyone.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-6 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 text-orange-400" />
                Corrections improve future builds
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-orange-400" />
                Learning data kept forever
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-orange-400" />
                Fewer rebuilds over time
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How We Compare */}
      <section className="px-6 pb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-white mb-2">How we compare</h2>
            <p className="text-slate-400 text-sm">Not all &ldquo;tasks&rdquo; are counted the same. ChainReact only counts actions &mdash; triggers, filters, and logic are free.</p>
          </div>

          {/* Counting method cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl border-2 border-orange-500 bg-orange-500/10 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center">
                  <Zap className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-sm font-semibold text-white">ChainReact</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">Only actions count as tasks</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-400">Trigger</span><span className="text-green-400 font-medium">Free</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Filter / Logic</span><span className="text-green-400 font-medium">Free</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Action (e.g. send email)</span><span className="text-orange-400 font-medium">1 task</span></div>
                <div className="border-t border-orange-500/30 pt-1.5 mt-1.5 flex justify-between font-semibold"><span className="text-white">3-action workflow</span><span className="text-orange-400">= 3 tasks</span></div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center">
                  <Zap className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-sm font-semibold text-white">Zapier</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">Actions count, triggers free</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-400">Trigger</span><span className="text-green-400 font-medium">Free</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Filter / Logic</span><span className="text-green-400 font-medium">Free</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Action (e.g. send email)</span><span className="text-slate-300 font-medium">1 task</span></div>
                <div className="border-t border-slate-700 pt-1.5 mt-1.5 flex justify-between font-semibold"><span className="text-white">3-action workflow</span><span className="text-slate-300">= 3 tasks</span></div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center">
                  <Zap className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-sm font-semibold text-white">Make.com</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">Everything counts as an operation</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-400">Trigger</span><span className="text-red-400 font-medium">1 operation</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Filter / Router</span><span className="text-red-400 font-medium">1 operation</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Action (e.g. send email)</span><span className="text-slate-300 font-medium">1 operation</span></div>
                <div className="border-t border-slate-700 pt-1.5 mt-1.5 flex justify-between font-semibold"><span className="text-white">3-action workflow</span><span className="text-red-400">= 5+ ops</span></div>
              </div>
            </div>
          </div>

          {/* Price comparison table */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left py-3 px-5 text-xs font-medium text-slate-400">Same workload</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-orange-500">ChainReact</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-slate-400">Zapier</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-slate-400">Make.com</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800/50">
                  <td className="py-3 px-5">
                    <div className="text-xs font-medium text-white">Solo (3 workflows, 10x/day)</div>
                    <div className="text-[11px] text-slate-500">~2,700 tasks/mo</div>
                  </td>
                  <td className="py-3 px-4 text-center bg-orange-500/[0.03]">
                    <div className="text-sm font-bold text-orange-400">$19/mo</div>
                    <div className="text-[11px] text-slate-500">3,000 tasks</div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="text-sm font-bold text-slate-300">$73.50/mo</div>
                    <div className="text-[11px] text-slate-500">2,000 tasks + overage</div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="text-sm font-bold text-slate-300">$18.82/mo</div>
                    <div className="text-[11px] text-slate-500">10,000 ops (4,500+ used)</div>
                  </td>
                </tr>
                <tr className="border-b border-slate-800/50">
                  <td className="py-3 px-5">
                    <div className="text-xs font-medium text-white">Team (8 workflows, 15x/day)</div>
                    <div className="text-[11px] text-slate-500">~7,200 tasks/mo</div>
                  </td>
                  <td className="py-3 px-4 text-center bg-orange-500/[0.03]">
                    <div className="text-sm font-bold text-orange-400">$49/mo</div>
                    <div className="text-[11px] text-slate-500">10,000 tasks</div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="text-sm font-bold text-slate-300">$103.50/mo</div>
                    <div className="text-[11px] text-slate-500">2,000 tasks + heavy overage</div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="text-sm font-bold text-slate-300">$34.12/mo</div>
                    <div className="text-[11px] text-slate-500">10,000 ops (12,000+ used)</div>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-5">
                    <div className="text-xs font-medium text-white">Business (20 workflows, 20x/day)</div>
                    <div className="text-[11px] text-slate-500">~18,000 tasks/mo</div>
                  </td>
                  <td className="py-3 px-4 text-center bg-orange-500/[0.03]">
                    <div className="text-sm font-bold text-orange-400">$149/mo</div>
                    <div className="text-[11px] text-slate-500">30,000 tasks</div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="text-sm font-bold text-slate-300">Custom</div>
                    <div className="text-[11px] text-slate-500">Enterprise only</div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="text-sm font-bold text-slate-300">$165+/mo</div>
                    <div className="text-[11px] text-slate-500">Scaled ops (30,000+ used)</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Key differentiators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1.5">vs Zapier</div>
              <p className="text-sm font-medium text-white mb-1">74% cheaper for the same work</p>
              <p className="text-xs text-slate-400">Same counting method, more tasks, fraction of the price. Plus AI builds your workflows automatically.</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1.5">vs Make.com</div>
              <p className="text-sm font-medium text-white mb-1">Fairer counting, AI-native</p>
              <p className="text-xs text-slate-400">Make charges for triggers and filters. We don&apos;t. And our AI agent builds workflows from a description &mdash; no manual node wiring.</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
              <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1.5">Only on ChainReact</div>
              <p className="text-sm font-medium text-white mb-1">AI workflow builder</p>
              <p className="text-xs text-slate-400">Describe what you want, AI builds it. Auto-configures fields, learns from corrections, and gets smarter over time.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="px-6 pb-16">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-10">
            Compare plans in detail
          </h2>
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 md:p-6">
            <ComparisonTable />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 pb-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-10">
            Frequently asked questions
          </h2>
          <FAQ />
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 pb-16">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Ready to build workflows that improve themselves?
          </h2>
          <p className="text-slate-400 mb-6">
            Start free. Build with AI. Upgrade when you need more.
          </p>
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 bg-orange-500 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-orange-400 transition-colors"
          >
            Get started free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <TempFooter />
    </div>
  )
}
