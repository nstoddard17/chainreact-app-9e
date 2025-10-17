"use client"

import React from "react"
import { Bell, Shield, Cpu, RefreshCw, ArrowRight, Palette, Globe } from "lucide-react"
import { TempAppShell } from "@/components/temp/TempAppShell"
import { TempButton } from "@/components/temp/TempButton"
import { TempBadge } from "@/components/temp/TempBadge"

const preferences = [
  {
    title: "Notifications",
    description:
      "Decide when teams are pinged automatically, and set thresholds for AI summaries.",
    icon: Bell,
    actions: ["Slack", "Email", "PagerDuty"],
  },
  {
    title: "Brand & tone",
    description:
      "Train AI with writing guidelines, voice, and terminology to keep outputs on-brand.",
    icon: Palette,
    actions: ["Upload style guide", "Preview assistant tone"],
  },
  {
    title: "Regional routing",
    description:
      "Ensure data and automations respect residency and jurisdiction requirements.",
    icon: Globe,
    actions: ["EU", "US", "APAC"],
  },
]

const security = [
  {
    title: "SAML / SSO",
    description: "Connect Okta, Azure AD, or Google Workspace for centralized access.",
    cta: "Configure SSO",
  },
  {
    title: "Audit streaming",
    description: "Send structured workflow logs to your SIEM or data lake.",
    cta: "Connect destination",
  },
  {
    title: "Session policies",
    description: "Control session duration, idle timeouts, and device posture requirements.",
    cta: "Review policies",
  },
]

export default function TempSettings() {
  return (
    <TempAppShell
      title="Settings"
      description="Concept view showing how we can declutter settings while surfacing relevant context."
      actions={
        <TempButton variant="secondary" contrast="light">
          Switch workspace
        </TempButton>
      }
    >
      <div className="space-y-10">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">
                Workspace preferences
              </p>
              <h2 className="text-xl font-semibold text-slate-900">
                Personalise the automation experience
              </h2>
            </div>
            <TempButton variant="ghost" contrast="light">
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync from production
            </TempButton>
          </header>
          <ul className="divide-y divide-slate-200">
            {preferences.map((item) => (
              <li
                key={item.title}
                className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-slate-100 p-3 text-slate-600">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {item.title}
                    </p>
                    <p className="text-sm text-slate-500">{item.description}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.actions.map((action) => (
                    <TempBadge key={action} tone="neutral" contrast="light">
                      {action}
                    </TempBadge>
                  ))}
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
                  Security & governance
                </p>
                <p className="text-xs text-slate-400">
                  Shows new card layout for security-critical tasks
                </p>
              </div>
            </header>
            <div className="px-6 py-5 space-y-4">
              {security.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-slate-800">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.description}
                  </p>
                  <TempButton variant="ghost" contrast="light" className="mt-4">
                    {item.cta}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </TempButton>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-500">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  AI runtime preview
                </p>
                <p className="text-xs text-slate-400">
                  Snapshot module for model usage and guardrails
                </p>
              </div>
            </header>
            <div className="px-6 py-5">
              <p className="text-sm font-semibold text-slate-800">
                Current profile · June 2024
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-500">
                <li>Primary model: gpt-4o (fallback gpt-4o-mini)</li>
                <li>Determinism guardrails: enabled (temperature 0.3)</li>
                <li>PII scrubbing: enforced at input + output layers</li>
              </ul>
              <TempButton variant="secondary" contrast="light" className="mt-4">
                Optimise runtime
              </TempButton>
            </div>
          </section>
        </div>
      </div>
    </TempAppShell>
  )
}
