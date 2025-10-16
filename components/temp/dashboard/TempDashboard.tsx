"use client"

import React from "react"
import { ArrowUp, ArrowDown, Zap, Workflow, Bot, ShieldCheck } from "lucide-react"
import { TempAppShell } from "@/components/temp/TempAppShell"
import { TempStatCard } from "@/components/temp/TempStatCard"
import { TempCard } from "@/components/temp/TempCard"
import { TempTable } from "@/components/temp/TempTable"
import { TempButton } from "@/components/temp/TempButton"

const metricData = [
  {
    label: "Automation throughput",
    value: "42,360 runs",
    change: "+18.4%",
    tone: "blue" as const,
    icon: <Zap className="h-5 w-5" />,
  },
  {
    label: "Active workflows",
    value: "128",
    change: "+6.1%",
    tone: "purple" as const,
    icon: <Workflow className="h-5 w-5" />,
  },
  {
    label: "AI agent satisfaction",
    value: "94%",
    change: "+12.0%",
    tone: "green" as const,
    icon: <Bot className="h-5 w-5" />,
  },
]

const pipeline = [
  {
    name: "High-touch onboarding",
    owner: "Workflow team",
    status: "Healthy",
    change: "+12%",
  },
  {
    name: "NPS follow-up automations",
    owner: "Lifecycle ops",
    status: "Needs attention",
    change: "-4%",
  },
  {
    name: "Incident retrospectives",
    owner: "Platform engineering",
    status: "Healthy",
    change: "+8%",
  },
]

const snapshot = [
  {
    title: "Incident guardrails",
    description: "Automated escalation and postmortem generator shipped to production.",
    author: "Ops Studio",
  },
  {
    title: "Workflow linting",
    description: "New policy checks ensure GPT outputs follow tone of voice guidelines.",
    author: "AI Platform",
  },
]

const alerts = [
  {
    title: "Action item: Contract renewals",
    description: "AI summaries ready for approval on 14 at-risk accounts.",
    urgency: "medium" as const,
  },
  {
    title: "Success: CSAT experiment",
    description: "Pilot automation cut resolution time by 37%.",
    urgency: "low" as const,
  },
]

export default function TempDashboard() {
  return (
    <TempAppShell
      title="Operations overview"
      description="A re-imagined dashboard experience with calmer color, clearer hierarchy, and purposeful metrics."
      actions={<TempButton>Publish change log</TempButton>}
    >
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="grid gap-5 md:grid-cols-3">
            {metricData.map((metric) => (
              <TempStatCard
                key={metric.label}
                label={metric.label}
                value={metric.value}
                change={metric.change}
                tone={metric.tone}
                icon={metric.icon}
              />
            ))}
          </div>

          <TempCard tone="light" className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">
                  Performance health
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">
                  Pipelines with the biggest impact this week
                </h2>
              </div>
              <TempButton variant="ghost">View details</TempButton>
            </div>
            <TempTable>
              <TempTable.Header columns={["Workflow", "Owner", "Status", "Change"]} />
              <TempTable.Body>
                {pipeline.map((row) => (
                  <TempTable.Row key={row.name}>
                    <TempTable.Cell className="font-medium text-slate-800">
                      {row.name}
                    </TempTable.Cell>
                    <TempTable.Cell>{row.owner}</TempTable.Cell>
                    <TempTable.Cell>
                      <span
                        className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                      >
                        {row.status}
                      </span>
                    </TempTable.Cell>
                    <TempTable.Cell>
                      <span
                        className={row.change.startsWith("-") ? "inline-flex items-center gap-1 text-sm font-semibold text-rose-500" : "inline-flex items-center gap-1 text-sm font-semibold text-emerald-500"}
                      >
                        {row.change.startsWith("-") ? (
                          <ArrowDown className="h-4 w-4" />
                        ) : (
                          <ArrowUp className="h-4 w-4" />
                        )}
                        {row.change.replace("+", "")}
                      </span>
                    </TempTable.Cell>
                  </TempTable.Row>
                ))}
              </TempTable.Body>
            </TempTable>
          </TempCard>
        </div>

        <div className="space-y-6">
          <TempCard tone="light" className="space-y-5">
            <header className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-slate-500" />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Shipping highlights
                </p>
                <p className="text-xs text-slate-400">
                  Previewing weekly summaries and release notes styling
                </p>
              </div>
            </header>
            <div className="space-y-4">
              {snapshot.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.description}
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">
                    {item.author}
                  </p>
                </div>
              ))}
            </div>
          </TempCard>

          <TempCard tone="light" className="space-y-4">
            <p className="text-sm font-semibold text-slate-800">
              Actions & alerts
            </p>
            <div className="space-y-4">
              {alerts.map((alert) => (
                <div
                  key={alert.title}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white p-4"
                >
                  <div
                    className={alert.urgency === "medium" ? "mt-1 h-2 w-2 rounded-full bg-amber-400" : "mt-1 h-2 w-2 rounded-full bg-emerald-400"}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {alert.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {alert.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <TempButton variant="secondary" className="w-full justify-center">
              Review queue
            </TempButton>
          </TempCard>
        </div>
      </div>
    </TempAppShell>
  )
}

