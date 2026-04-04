"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { PlaceholderMedia } from './PlaceholderMedia'

const features = [
  {
    title: 'AI reads your actual documents',
    description: 'Connect Google Drive, Notion, or any doc store. When a workflow needs context, AI searches your real data — not a generic model.',
    screenshotLabel: 'Screenshot: AI node configuration with document access',
    span: 'lg:col-span-7',
  },
  {
    title: 'Smart routing, not rigid rules',
    description: 'AI Router handles branching decisions that would normally require 20 if/then conditions. It adapts as your data changes.',
    screenshotLabel: 'Screenshot: Workflow with AI Router branching',
    span: 'lg:col-span-5',
  },
  {
    title: 'See what\'s working',
    description: 'Execution logs, success rates, accuracy trends. Know exactly when your workflow handled something new vs. when it asked for help.',
    screenshotLabel: 'Screenshot: Analytics dashboard with KPI cards',
    span: 'lg:col-span-5',
  },
  {
    title: 'Templates to start fast',
    description: 'Pre-built workflows for support, sales, content, and ops. Pick one, connect your tools, and you\'re running in 5 minutes.',
    screenshotLabel: 'Screenshot: Template library grid',
    span: 'lg:col-span-7',
  },
]

export function FeatureShowcase() {
  return (
    <section id="features" className="relative px-4 sm:px-6 lg:px-8 py-24">
      <div className="max-w-6xl mx-auto">
        {/* Header — left aligned, not centered */}
        <div className="mb-14">
          <h2 className="font-[var(--font-space-grotesk)] text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-3">
            What else is in the box
          </h2>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-lg">
            The stuff that makes it actually usable, not just impressive in a demo.
          </p>
        </div>

        {/* Asymmetric grid — 7/5 then 5/7, not uniform 6/6 */}
        <div className="grid lg:grid-cols-12 gap-5">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.06 }}
              className={`${feature.span} rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900/40 overflow-hidden`}
            >
              {/* Screenshot first on odd cards, text first on even — creates visual rhythm */}
              <div className="p-6 pb-0">
                <h3 className="font-[var(--font-space-grotesk)] text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-5">
                  {feature.description}
                </p>
              </div>
              <div className="px-6 pb-6">
                <PlaceholderMedia
                  label={feature.screenshotLabel}
                  aspectRatio="16/9"
                  type="screenshot"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
