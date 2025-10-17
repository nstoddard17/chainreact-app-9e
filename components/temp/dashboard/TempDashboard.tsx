"use client"

import React from "react"
import { ArrowUp, ArrowDown, ShieldCheck } from "lucide-react"
import { TempAppShell } from "@/components/temp/TempAppShell"
import { TempTable } from "@/components/temp/TempTable"
import { TempButton } from "@/components/temp/TempButton"

const metricData = [
  {
    label: "Automation throughput",
    value: "42,360 runs",
    change: "+18.4%",
  },
  {
    label: "Active workflows",
    value: "128",
    change: "+6.1%",
  },
  {
    label: "AI agent satisfaction",
    value: "94%",
    change: "+12.0%",
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
      actions={<TempButton contrast="light">Publish change log</TempButton>}
    >
      <div className="space-y-10">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {metricData.map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                {metric.label}
              </span>
              <p className="mt-4 text-3xl font-semibold text-slate-900">
                {metric.value}
              </p>
              <p className="mt-1 text-sm text-slate-500">vs last 30 days</p>
              <p
                className={`mt-5 text-sm font-semibold ${
                  metric.change.startsWith("-")
                    ? "text-rose-500"
                    : "text-emerald-600"
                }`}
              >
                {metric.change}
              </p>
            </div>
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">
                  Performance health
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  Pipelines with the biggest impact this week
                </h2>
              </div>
              <TempButton variant="ghost" contrast="light">
                View details
              </TempButton>
            </header>
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
                      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        {row.status}
                      </span>
                    </TempTable.Cell>
                    <TempTable.Cell>
                      <span
                        className={
                          row.change.startsWith("-")
                            ? "inline-flex items-center gap-1 text-sm font-semibold text-rose-500"
                            : "inline-flex items-center gap-1 text-sm font-semibold text-emerald-500"
                        }
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
          </section>

          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
                <div className="rounded-lg bg-slate-100 p-2 text-slate-500">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Shipping highlights
                  </p>
                  <p className="text-xs text-slate-400">
                    Weekly summaries and release notes preview
                  </p>
                </div>
              </header>
              <div className="space-y-4 px-5 py-5">
                {snapshot.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
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
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="border-b border-slate-200 px-5 py-4">
                <p className="text-sm font-semibold text-slate-800">
                  Actions & alerts
                </p>
              </header>
              <div className="space-y-4 px-5 py-5">
                {alerts.map((alert) => (
                  <div
                    key={alert.title}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3"
                  >
                    <span
                      className={
                        alert.urgency === "medium"
                          ? "mt-1 inline-block h-2 w-2 rounded-full bg-amber-400"
                          : "mt-1 inline-block h-2 w-2 rounded-full bg-emerald-400"
                      }
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
              <div className="border-t border-slate-200 px-5 py-4">
                <TempButton
                  variant="secondary"
                  contrast="light"
                  className="w-full justify-center"
                >
                  Review queue
                </TempButton>
              </div>
            </section>
          </div>
        </div>
      </div>
    </TempAppShell>
  )
}
