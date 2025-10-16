"use client"

import React from "react"
import { Sparkles, Zap, ShieldCheck, Workflow, Bot, Clock, ArrowUpRight, CheckCircle } from "lucide-react"
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
      <section className="relative overflow-hidden pb-24 pt-24">
        <div className="mx-auto flex w-[min(1180px,94%)] flex-col items-center gap-12 text-center">
          <TempBadge tone="blue">New design preview</TempBadge>
          <div className="max-w-4xl space-y-6">
            <h1 className="text-5xl font-semibold text-white md:text-6xl">
              Ship automation that feels bespoke, not bolted on
            </h1>
            <p className="text-lg text-slate-300 md:text-xl">
              ChainReact unifies AI orchestration, human approvals, and system integrations so operations teams can deliver polished experiences without maintaining brittle scripts.
            </p>
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <TempButton size="lg">
              Start building
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </TempButton>
            <TempButton variant="secondary" size="lg">
              Watch 3 minute overview
            </TempButton>
          </div>
          <div className="mt-16 grid w-full gap-6 md:grid-cols-3">
            {stats.map((stat) => (
              <TempCard key={stat.label} className="text-left">
                <p className="text-sm text-slate-400">{stat.label}</p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {stat.value}
                </p>
              </TempCard>
            ))}
          </div>
        </div>
      </section>

      <TempSection
        id="product"
        eyebrow="Workflow OS"
        title="A coordinated surface for automations, agents, and teams"
        description="Design complex logic visually, stage AI automations safely, and keep every update observable."
      >
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
          <TempCard className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/10 via-violet-500/10 to-transparent" />
            <div className="relative space-y-8">
              <header className="border-b border-white/10 pb-6">
                <p className="text-sm font-semibold text-slate-200">
                  Workflow blueprint
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Launch support-driven onboarding in minutes
                </h3>
              </header>
              <div className="grid gap-5 text-sm text-slate-300 sm:grid-cols-2">
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.3em] text-blue-300">
                    <Sparkles className="h-3 w-3" />
                    Trigger
                  </span>
                  <p className="text-white">New enterprise lead captured</p>
                  <p>Enrich context with CRM data and assign account pod automatically.</p>
                </div>
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.3em] text-violet-300">
                    <Bot className="h-3 w-3" />
                    AI assist
                  </span>
                  <p className="text-white">Draft personalized kickoff plan</p>
                  <p>Ground outputs in product docs, billing history, and past support transcripts.</p>
                </div>
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.3em] text-emerald-300">
                    <ShieldCheck className="h-3 w-3" />
                    Approvals
                  </span>
                  <p className="text-white">Playbook guardrails</p>
                  <p>Route exceptions to the right reviewer with traceable rationale.</p>
                </div>
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.3em] text-slate-200">
                    <Clock className="h-3 w-3" />
                    Observability
                  </span>
                  <p className="text-white">Real-time health snapshots</p>
                  <p>Aggregate the signal you need to iterate without shipping bugs to production.</p>
                </div>
              </div>
            </div>
          </TempCard>
          <div className="space-y-6">
            {features.map((feature) => (
              <TempCard key={feature.title}>
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-white">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm text-slate-300">
                      {feature.description}
                    </p>
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
                <h3 className="text-xl font-semibold text-white">
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
      >
        <div className="grid gap-6 md:grid-cols-2">
          {pricing.map((plan, idx) => (
            <TempCard
              key={plan.name}
              className="h-full bg-white/[0.06]"
            >
              <div className="flex flex-col gap-6">
                <div>
                  <p className="text-sm font-semibold text-sky-300">
                    {plan.name}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    {plan.price} <span className="text-sm text-slate-400">/ seat</span>
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

