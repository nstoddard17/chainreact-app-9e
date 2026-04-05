"use client"

import React from 'react'
import { MousePointerClick, LayoutTemplate, Activity, Users, ImageIcon } from 'lucide-react'

const features = [
  {
    icon: MousePointerClick,
    title: 'Visual workflow builder',
    description: '247+ nodes across 35+ integrations. Drag, drop, and connect with conditional logic, loops, filters, and HTTP requests.',
    details: ['Drag-and-drop canvas', 'Conditional branching', 'Loop & filter nodes', 'HTTP request support'],
    screenshotHint: 'Screenshot: Open /workflows/builder with a multi-node workflow on canvas showing connected nodes with filled fields.',
    colSpan: 'lg:col-span-7',
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-50',
  },
  {
    icon: LayoutTemplate,
    title: 'Pre-built templates',
    description: '40+ workflows ready to customize. Pick a template, connect your tools, deploy in one click.',
    details: ['Support, Sales, Content, Ops', 'One-click deploy', 'Fully customizable'],
    screenshotHint: 'Screenshot: Template gallery showing cards with categories and a "Use template" button.',
    colSpan: 'lg:col-span-5',
    iconColor: 'text-purple-500',
    iconBg: 'bg-purple-50',
  },
  {
    icon: Activity,
    title: 'Execution monitoring',
    description: 'Real-time logs for every run. See exactly what happened at each step, with timing and error details.',
    details: ['Node-by-node results', 'Error explanations', 'Automatic retry', 'Performance timing'],
    screenshotHint: 'Screenshot: Execution history with a completed run expanded showing green success indicators and timing per node.',
    colSpan: 'lg:col-span-5',
    iconColor: 'text-green-500',
    iconBg: 'bg-green-50',
  },
  {
    icon: Users,
    title: 'Teams & collaboration',
    description: 'Shared workspaces with role-based permissions. Built for solo operators and growing teams.',
    details: ['Owner / Editor / Viewer roles', 'Shared workspaces', 'Workflow versioning'],
    screenshotHint: 'Screenshot: Team settings page showing member list with roles and an invite button.',
    colSpan: 'lg:col-span-7',
    iconColor: 'text-orange-500',
    iconBg: 'bg-orange-50',
  },
]

export function FeaturesGrid() {
  return (
    <section id="features" className="px-4 sm:px-6 lg:px-8 py-24 bg-slate-950">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-4">
            Everything you need to automate
          </h2>
          <p className="text-lg text-slate-400 max-w-xl mx-auto">
            A complete platform, not just an AI trick
          </p>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className={`${feature.colSpan} bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:shadow-md hover:shadow-slate-900/50 transition-shadow duration-200 flex flex-col`}
              >
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-lg ${feature.iconBg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${feature.iconColor}`} />
                    </div>
                    <h3 className="text-lg font-semibold text-white">
                      {feature.title}
                    </h3>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed mb-4">
                    {feature.description}
                  </p>
                  {/* Detail tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {feature.details.map((detail) => (
                      <span
                        key={detail}
                        className="text-[11px] font-medium text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full"
                      >
                        {detail}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Screenshot placeholder */}
                <div className="flex-1 bg-slate-950 border-t border-slate-800 flex flex-col items-center justify-center gap-2 px-6 py-10 min-h-[200px]">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-slate-500" />
                  </div>
                  <p className="text-xs text-slate-500 text-center max-w-[260px] leading-relaxed">
                    {feature.screenshotHint}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
