"use client"

import React from "react"
import { Plus, Filter, Wand2, Clock4, Activity, ArrowRight } from "lucide-react"
import { TempAppShell } from "@/components/temp/TempAppShell"
import { TempButton } from "@/components/temp/TempButton"
import { TempTable } from "@/components/temp/TempTable"

const workflows = [
  {
    name: "VIP onboarding journey",
    status: "Active",
    lastRun: "3 minutes ago",
    owner: "Customer Experience",
    impact: "High",
  },
  {
    name: "Churn rescue playbook",
    status: "In review",
    lastRun: "22 minutes ago",
    owner: "Lifecycle Ops",
    impact: "Medium",
  },
  {
    name: "Incident retro summarizer",
    status: "Paused",
    lastRun: "1 hour ago",
    owner: "Engineering",
    impact: "High",
  },
  {
    name: "Finance close checklist",
    status: "Active",
    lastRun: "Yesterday",
    owner: "RevOps",
    impact: "Medium",
  },
]

const templates = [
  {
    name: "AI-powered onboarding concierge",
    description:
      "Blend AI-generated messaging with human approvals and product telemetry.",
    category: "Customer Experience",
  },
  {
    name: "Automatic incident communication",
    description:
      "Trigger multi-channel updates with templated postmortems for critical issues.",
    category: "Engineering",
  },
]

export default function TempWorkflows() {
  return (
    <TempAppShell
      title="Workflow library"
      description="Preview of the calmer workflow catalog: consistent spacing, clearer filters, and emphasis on next actions."
      actions={
        <div className="flex items-center gap-3">
          <TempButton variant="ghost" contrast="light">
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </TempButton>
          <TempButton contrast="light">
            <Plus className="mr-2 h-4 w-4" />
            New workflow
          </TempButton>
        </div>
      }
    >
      <div className="space-y-10">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500">
                My automations
              </p>
              <h2 className="text-xl font-semibold text-slate-900">
                Active workflows
              </h2>
            </div>
            <TempButton variant="ghost" contrast="light">
              See analytics
            </TempButton>
          </header>
          <TempTable>
            <TempTable.Header
              columns={["Workflow", "Owner", "Status", "Last run", "Impact"]}
            />
            <TempTable.Body>
              {workflows.map((wf) => (
                <TempTable.Row key={wf.name}>
                  <TempTable.Cell className="font-semibold text-slate-900">
                    {wf.name}
                  </TempTable.Cell>
                  <TempTable.Cell>{wf.owner}</TempTable.Cell>
                  <TempTable.Cell>
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {wf.status}
                    </span>
                  </TempTable.Cell>
                  <TempTable.Cell>{wf.lastRun}</TempTable.Cell>
                  <TempTable.Cell>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-500">
                      <Activity className="h-4 w-4" />
                      {wf.impact}
                    </span>
                  </TempTable.Cell>
                </TempTable.Row>
              ))}
            </TempTable.Body>
          </TempTable>
        </section>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-500">
                <Wand2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Guided builder
                </p>
                <p className="text-xs text-slate-400">
                  Reimagined checkpoint cards with simplified copy
                </p>
              </div>
            </header>
            <ul className="px-5 py-5 space-y-4">
              {[
                {
                  title: "Describe the outcome",
                  detail:
                    "Tell the system what success looks like so the AI can outline a safe draft.",
                  icon: <Wand2 className="h-4 w-4" />,
                },
                {
                  title: "Map stakeholders",
                  detail:
                    "Drag-and-drop internal teams or external customers into the orchestration.",
                  icon: <Clock4 className="h-4 w-4" />,
                },
                {
                  title: "Add observability",
                  detail:
                    "Choose logging, health checks, and escalation paths before going live.",
                  icon: <Activity className="h-4 w-4" />,
                },
              ].map((step) => (
                <li
                  key={step.title}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="mt-1 rounded-full bg-slate-100 p-2 text-slate-500">
                    {step.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {step.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-200 px-5 py-4">
              <TempButton
                variant="secondary"
                contrast="light"
                className="w-full justify-center"
              >
                Launch guided mode
              </TempButton>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Featured templates
                </p>
                <p className="text-xs text-slate-400">
                  How reusable blueprints will appear in the new system
                </p>
              </div>
              <TempButton variant="ghost" contrast="light">
                View library
                <ArrowRight className="ml-2 h-4 w-4" />
              </TempButton>
            </header>
            <div className="px-5 py-5 space-y-4">
              {templates.map((template) => (
                <div
                  key={template.name}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-slate-800">
                    {template.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {template.description}
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">
                    {template.category}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </TempAppShell>
  )
}
