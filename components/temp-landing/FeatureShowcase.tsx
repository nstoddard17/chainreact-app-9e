"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { MousePointerClick, LayoutTemplate, Activity, Users } from 'lucide-react'
import { PlaceholderMedia } from './PlaceholderMedia'

const features = [
  {
    icon: MousePointerClick,
    title: 'Visual builder for when you want control',
    description: 'Drag-and-drop 247+ nodes across 35+ integrations. Conditional logic, loops, filters, and HTTP requests. Full power when you need it.',
    screenshotLabel: 'CAPTURE: Screenshot of /workflows/builder with a multi-node workflow on canvas. Show 5+ connected nodes (trigger, AI node, actions) with the sidebar collapsed. Use a real workflow with filled fields visible.',
    span: 'lg:col-span-7',
  },
  {
    icon: LayoutTemplate,
    title: 'Templates to start in 5 minutes',
    description: '40+ pre-built workflows for support, sales, content, and ops. Pick one, connect your tools, and go.',
    screenshotLabel: 'CAPTURE: Screenshot of the template gallery page (/templates or the template picker modal). Show the grid of template cards with category filters visible. Include at least 6 templates across different categories.',
    span: 'lg:col-span-5',
  },
  {
    icon: Activity,
    title: "Know what's working",
    description: 'Execution logs, success rates, error tracking. See every step your workflow took and debug issues instantly.',
    screenshotLabel: 'CAPTURE: Screenshot of execution history for a completed workflow. Show the node-by-node execution detail panel with green success indicators, timing data, and input/output data for at least one expanded node.',
    span: 'lg:col-span-5',
  },
  {
    icon: Users,
    title: 'Teams and sharing',
    description: 'Share workflows with your team, manage permissions, and collaborate across workspaces. Built for solo operators and growing teams.',
    screenshotLabel: 'CAPTURE: Screenshot of the team/organization settings or workflow sharing modal. Show the member list with different roles (Owner, Editor, Viewer) and the invite button. Navigate to /settings or the org page.',
    span: 'lg:col-span-7',
  },
]

export function FeatureShowcase() {
  return (
    <section id="features" className="relative px-4 sm:px-6 lg:px-8 py-16">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-[var(--font-space-grotesk)] text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-3">
            Everything else you need
          </h2>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            A complete platform, not just an AI trick.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-4">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.06 }}
                className={`${feature.span} rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900/60 overflow-hidden shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200`}
              >
                <div className="p-5 pb-0">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div>
                      <h3 className="font-[var(--font-space-grotesk)] text-base font-semibold text-slate-900 dark:text-white mb-1">
                        {feature.title}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="px-5 pb-5">
                  <PlaceholderMedia
                    label={feature.screenshotLabel}
                    aspectRatio="16/9"
                    type="screenshot"
                  />
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
