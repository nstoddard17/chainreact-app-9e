"use client"

import React from "react"
import { Plug, Shield, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react"
import { TempAppShell } from "@/components/temp/TempAppShell"
import { TempButton } from "@/components/temp/TempButton"
import { TempBadge } from "@/components/temp/TempBadge"

const integrations = [
  {
    name: "Salesforce",
    status: "Connected",
    sync: "12 minutes ago",
    health: "Good",
    description:
      "Bi-directional sync with queue-based retrying and deduplication.",
  },
  {
    name: "Zendesk",
    status: "Attention needed",
    sync: "45 minutes ago",
    health: "Warning",
    description:
      "Token expires in 3 days. Rotate before scheduled compliance audit.",
  },
  {
    name: "PostgreSQL warehouse",
    status: "Connected",
    sync: "2 minutes ago",
    health: "Good",
    description:
      "Streaming workflow metrics and trace logs into secure warehouse schema.",
  },
  {
    name: "Slack",
    status: "Connected",
    sync: "Live",
    health: "Good",
    description:
      "Posting approval requests, incident updates, and human handoffs.",
  },
]

export default function TempIntegrations() {
  return (
    <TempAppShell
      title="Integrations"
      description="A concept view that surfaces health, sync cadence, and next actions without the noise."
      actions={<TempButton contrast="light">New connection</TempButton>}
    >
      <div className="space-y-10">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">
                Connection directory
              </p>
              <h2 className="text-xl font-semibold text-slate-900">
                Active integrations
              </h2>
            </div>
            <TempButton variant="ghost" contrast="light">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </TempButton>
          </header>
          <ul className="divide-y divide-slate-200">
            {integrations.map((integration) => (
              <li
                key={integration.name}
                className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <Plug className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {integration.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {integration.description}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-2 md:items-end">
                  <div className="flex items-center gap-2">
                    {integration.status === "Connected" ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-600">
                        <AlertTriangle className="h-4 w-4" />
                        Attention
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      Last sync · {integration.sync}
                    </span>
                  </div>
                  <TempButton
                    variant="secondary"
                    size="md"
                    contrast="light"
                  >
                    Manage
                  </TempButton>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-500">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Trust & compliance
                </p>
                <p className="text-xs text-slate-400">
                  Side panel preview for security-sensitive info
                </p>
              </div>
            </header>
            <ul className="px-6 py-5 divide-y divide-slate-200">
              {[
                "SOC 2 Type II controls enforced across every integration scope.",
                "Regional processing policies for EU + APAC are respected automatically.",
                "Comprehensive audit log streaming to your security data lake.",
              ].map((item) => (
                <li
                  key={item}
                  className="py-4 text-sm text-slate-600"
                >
                  {item}
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-200 px-6 py-4">
              <TempButton
                variant="ghost"
                contrast="light"
                className="justify-center"
              >
                View compliance report
              </TempButton>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-200 px-6 py-5">
              <p className="text-sm font-semibold text-slate-800">
                Upcoming launches
              </p>
              <p className="text-xs text-slate-400">
                Example of how roadmap callouts will render
              </p>
            </header>
            <div className="px-6 py-5 space-y-4">
              {[
                {
                  name: "ServiceNow",
                  description: "Incident synchronisation with approval gates.",
                },
                {
                  name: "Amplitude",
                  description:
                    "Product analytics segments available as workflow triggers.",
                },
              ].map((item) => (
                <div
                  key={item.name}
                  className="flex items-start justify-between gap-4 border border-slate-200 rounded-xl px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {item.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.description}
                    </p>
                  </div>
                  <TempBadge tone="neutral" contrast="light">
                    In beta
                  </TempBadge>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </TempAppShell>
  )
}
