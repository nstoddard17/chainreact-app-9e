"use client"

import React from "react"
import {
  Sparkles,
  Zap,
  ShieldCheck,
  Workflow,
  Bot,
  Clock,
  ArrowUpRight,
  CheckCircle,
} from "lucide-react"
import { TempMarketingLayout } from "@/components/temp/TempMarketingLayout"
import { TempBadge } from "@/components/temp/TempBadge"
import { TempButton } from "@/components/temp/TempButton"
import { TempCard } from "@/components/temp/TempCard"
import { TempSection } from "@/components/temp/TempSection"

const stats = [
  { label: "Workflow executions / month", value: "2.3M" },
  { label: "Median integration setup time", value: "6 min" },
  { label: "Manual work reduced", value: "82%" },
]

const features = [
  {
    icon: Workflow,
    title: "Visual orchestration without limits",
    description:
      "Design branching automations, human-in-the-loop approvals, and observability checkpoints in one canvas.",
  },
  {
    icon: Bot,
    title: "AI that understands your context",
    description:
      "Ground large language models in live CRM, support, and operations data with guardrails built in.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise-grade controls by default",
    description:
      "SOC 2 ready logging, fine-grained permissions, and regional data residency help you stay compliant.",
  },
]

const pricing = [
  {
    name: "Launch",
    description: "Everything a lean team needs to orchestrate AI-assisted workflows.",
    price: "$49",
    cta: "Start building",
    features: [
      "10 team seats included",
      "Unlimited workflow versions",
      "250 AI automation credits",
      "Slack & email notifications",
    ],
  },
  {
    name: "Scale",
    description: "Advanced controls and capacity for teams shipping production-grade automations.",
    price: "$189",
    cta: "Chat with us",
    features: [
      "Role-based access & audit logs",
      "Automated regression testing",
      "Performance dashboards",
      "Priority support SLA",
    ],
  },
]

export default function TempHomepage() {
  return (
    <TempMarketingLayout>
      <section className="pt-24">
        <div className="mx-auto w-[min(1120px,94%)]">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-8">
              <TempBadge tone="blue">Design preview</TempBadge>
              <div className="space-y-6">
                <h1 className="text-4xl font-semibold md:text-5xl">
                  Automation your operations team trusts on day one
                </h1>
                <p className="text-lg text-slate-300 md:text-xl">
                  ChainReact brings orchestration, AI assistance, and approvals into a
                  single workspace so you can design reliable experiences without the
                  drag of brittle scripts.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <TempButton size="lg">
                  Start building
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </TempButton>
                <TempButton variant="secondary" size="lg">
                  See platform tour
                </TempButton>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/10 bg-[#111b2d] px-4 py-5"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {stat.label}
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-slate-100">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <TempCard className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-200">
                  Weekly automation snapshot
                </p>
                <p className="text-xs text-slate-400">
                  The dashboard module in the refreshed UI surfaces the signal your
                  ops team actually needs.
                </p>
              </div>
              <div className="grid gap-4">
                {[
                  {
                    title: "Human-in-the-loop approvals",
                    detail: "8 decisions resolved · SLA 14m",
                  },
                  {
                    title: "AI authored responses",
                    detail: "94% adoption · 3% manual edits",
                  },
                  {
                    title: "High-impact incidents",
                    detail: "Zero unacknowledged · 2 mitigated automatically",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-white/12 bg-[#10192d] px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-slate-100">
                      {item.title}
                    </p>
                    <p className="text-sm text-slate-300">{item.detail}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/12 bg-[#10192d] px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Trend
                  </p>
                  <p className="text-lg font-semibold text-slate-100">
                    18% more reliable launches
                  </p>
                </div>
                <Zap className="h-5 w-5 text-blue-300" />
              </div>
            </TempCard>
          </div>
        </div>
      </section>

      <TempSection
        id="product"
        eyebrow="Workflow OS"
        title="A coordinated surface for automations, agents, and teams"
        description="Design complex logic visually, stage AI automations safely, and keep every update observable."
        tone="dark"
      >
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <TempCard className="space-y-6">
            <header className="space-y-2">
              <p className="text-sm font-semibold text-slate-200">
                Workflow blueprint
              </p>
              <h3 className="text-2xl font-semibold">
                Launch support-driven onboarding in minutes
              </h3>
              <p className="text-sm text-slate-300">
                The new builder keeps every step in one place—no overlapping
                modals or hidden state.
              </p>
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  label: "Trigger",
                  icon: <Sparkles className="h-3 w-3" />,
                  body: "New enterprise lead captured with Salesforce enrichment.",
                },
                {
                  label: "AI assist",
                  icon: <Bot className="h-3 w-3" />,
                  body: "Draft kickoff summary grounded in contracts and past support tickets.",
                },
                {
                  label: "Approvals",
                  icon: <ShieldCheck className="h-3 w-3" />,
                  body: "Route exceptions to senior CSMs with rationales attached.",
                },
                {
                  label: "Observability",
                  icon: <Clock className="h-3 w-3" />,
                  body: "Live health indicators and run logs without leaving the canvas.",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/12 bg-[#101c32] p-4"
                >
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-300">
                    {item.icon}
                    {item.label}
                  </span>
                  <p className="mt-3 text-sm text-slate-200">{item.body}</p>
                </div>
              ))}
            </div>
          </TempCard>
          <div className="space-y-4">
            {features.map((feature) => (
              <TempCard key={feature.title} className="p-5">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3 text-white">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">{feature.title}</h3>
                    <p className="text-sm text-slate-300">{feature.description}</p>
                  </div>
                </div>
              </TempCard>
            ))}
          </div>
        </div>
      </TempSection>

      <TempSection
        id="solutions"
        eyebrow="Use cases"
        title="Go live faster across operations"
        description="Previewing the new layout for solution tables—this structure makes it easier to skim and compare workflows."
        tone="dark"
      >
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Revenue operations",
              description:
                "Automate lead routing, pipeline hygiene, and renewal workflows with human approvals baked in.",
              points: ["Salesforce + HubSpot bi-directional sync", "Forecast rollups with anomaly detection", "Playbook drift alerts"],
            },
            {
              title: "Customer support",
              description:
                "Help agents respond with context-aware suggestions while keeping leadership looped in on trends.",
              points: ["Zendesk intent classification", "Quality coach summaries by channel", "Incident escalation protocols"],
            },
            {
              title: "Product & engineering",
              description:
                "Coordinate release management, on-call rotations, and changelog updates from one orchestration layer.",
              points: ["AI-generated release notes with approvals", "PagerDuty shift handoffs", "Automated postmortem packets"],
            },
          ].map((item) => (
            <TempCard key={item.title}>
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-300">{item.description}</p>
                <ul className="space-y-3 text-sm text-slate-200">
                  {item.points.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <CheckCircle className="mt-[2px] h-4 w-4 text-sky-400" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </TempCard>
          ))}
        </div>
      </TempSection>

      <TempSection
        id="pricing"
        eyebrow="Pricing"
        title="Right-sized plans with transparent capacity"
        description="These cards preview the spacing, typography, and control styles for the pricing surface."
        tone="dark"
      >
        <div className="grid gap-6 md:grid-cols-2">
          {pricing.map((plan, idx) => (
            <TempCard key={plan.name} className="h-full">
              <div className="flex flex-col gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-300">
                    {plan.name}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold">
                    {plan.price}
                    <span className="text-sm text-slate-400"> / seat</span>
                  </h3>
                  <p className="mt-3 text-sm text-slate-300">
                    {plan.description}
                  </p>
                </div>
                <ul className="space-y-3 text-sm text-slate-200">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckCircle className="mt-[2px] h-4 w-4 text-sky-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <TempButton
                  variant={idx === 0 ? "primary" : "secondary"}
                  className="w-full justify-center"
                >
                  {plan.cta}
                </TempButton>
              </div>
            </TempCard>
          ))}
        </div>
      </TempSection>
    </TempMarketingLayout>
  )
}
