"use client"

import React from "react"
import { Plug, Shield, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react"
import { TempAppShell } from "@/components/temp/TempAppShell"
import { TempCard } from "@/components/temp/TempCard"
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
      actions={<TempButton>New connection</TempButton>}
    >
      <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
        <TempCard tone="light" className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">
                Connection directory
              </p>
              <h2 className="text-xl font-semibold text-slate-900">
                Active integrations
              </h2>
            </div>
            <TempButton variant="ghost">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </TempButton>
          </div>
          <div className="grid gap-4">
            {integrations.map((integration) => (
              <div
                key={integration.name}
                className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
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
                  <TempButton variant="secondary" size="md">
                    Manage
                  </TempButton>
                </div>
              </div>
            ))}
          </div>
        </TempCard>

        <div className="space-y-6">
          <TempCard tone="light" className="space-y-5">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-slate-500" />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Trust & compliance
                </p>
                <p className="text-xs text-slate-400">
                  Side panel preview for security-sensitive info
                </p>
              </div>
            </div>
            <ul className="space-y-4 text-sm text-slate-600">
              <li className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
                SOC 2 Type II controls enforced across every integration scope.
              </li>
              <li className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
                Regional processing policies for EU + APAC are respected automatically.
              </li>
              <li className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
                Comprehensive audit log streaming to your security data lake.
              </li>
            </ul>
            <TempButton variant="ghost" className="w-full justify-center">
              View compliance report
            </TempButton>
          </TempCard>

          <TempCard tone="light" className="space-y-4">
            <p className="text-sm font-semibold text-slate-800">
              Upcoming launches
            </p>
            <p className="text-xs text-slate-400">
              Example of how roadmap callouts will render
            </p>
            <div className="space-y-3">
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
                  className="flex items-start justify-between rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {item.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.description}
                    </p>
                  </div>
                  <TempBadge tone="neutral">In beta</TempBadge>
                </div>
              ))}
            </div>
          </TempCard>
        </div>
      </div>
    </TempAppShell>
  )
}

