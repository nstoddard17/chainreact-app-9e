"use client"

import React from 'react'
import { MousePointerClick, LayoutTemplate, Activity, Users } from 'lucide-react'

const features = [
  {
    icon: MousePointerClick,
    title: 'Visual workflow builder',
    description: '247+ nodes, 35+ integrations. Drag, drop, connect — or let AI do it.',
    colSpan: 'lg:col-span-7',
  },
  {
    icon: LayoutTemplate,
    title: 'Pre-built templates',
    description: '40+ workflows ready to customize and deploy in one click.',
    colSpan: 'lg:col-span-5',
  },
  {
    icon: Activity,
    title: 'Execution monitoring',
    description: 'Real-time logs, error tracking, and automatic retry.',
    colSpan: 'lg:col-span-5',
  },
  {
    icon: Users,
    title: 'Teams & collaboration',
    description: 'Shared workspaces, permissions, and workflow versioning.',
    colSpan: 'lg:col-span-7',
  },
]

export function FeaturesGrid() {
  return (
    <section id="features" className="px-4 sm:px-6 lg:px-8 py-24 bg-white">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 mb-4">
            Everything you need to automate
          </h2>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className={`${feature.colSpan} bg-white border border-slate-200 rounded-xl overflow-hidden`}
              >
                <div className="p-6">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-slate-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">
                    {feature.title}
                  </h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
                <div className="bg-slate-50 flex items-center justify-center" style={{ aspectRatio: '4/3' }}>
                  <span className="text-sm text-slate-400">Screenshot placeholder</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
