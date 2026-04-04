"use client"

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { PlaceholderMedia } from './PlaceholderMedia'

interface UseCase {
  id: string
  tab: string
  headline: string
  pain: string
  outcome: string
  flow: string[]
  screenshotLabel: string
}

const useCases: UseCase[] = [
  {
    id: 'support',
    tab: 'Support',
    headline: 'Customer emails → resolved tickets',
    pain: 'Your team spends 2 hours every morning triaging the inbox.',
    outcome: 'AI reads each email, pulls context from your docs, drafts a response, and flags anything it\'s unsure about. You approve with one click.',
    flow: ['Email arrives', 'AI reads + classifies', 'Pulls relevant docs', 'You approve or correct', 'Response sent'],
    screenshotLabel: 'Screenshot: Customer support workflow in the builder',
  },
  {
    id: 'sales',
    tab: 'Sales',
    headline: 'Payments → CRM updates → team notifications',
    pain: 'Someone on your team manually copies Stripe data into HubSpot after every deal.',
    outcome: 'Payment comes in, AI extracts the details, updates your CRM, and posts to the right Slack channel — all in under a second.',
    flow: ['Stripe payment', 'AI extracts details', 'Updates HubSpot', 'Routes by deal size', 'Slack notification'],
    screenshotLabel: 'Screenshot: Sales pipeline workflow in the builder',
  },
  {
    id: 'marketing',
    tab: 'Content',
    headline: 'One post → five platforms',
    pain: 'You write a blog post, then spend an hour reformatting it for Twitter, LinkedIn, and email.',
    outcome: 'Publish in Notion, and AI automatically reformats for each platform, matches your brand voice, and schedules everything.',
    flow: ['Post published', 'AI reformats per platform', 'Matches brand voice', 'Schedules posts', 'Tracks engagement'],
    screenshotLabel: 'Screenshot: Content distribution workflow in the builder',
  },
  {
    id: 'operations',
    tab: 'Ops',
    headline: 'Keep three tools in sync without thinking about it',
    pain: 'You update a record in Airtable and then have to manually mirror it in Notion and HubSpot.',
    outcome: 'Change one record, AI validates it against your business rules, checks for conflicts, and syncs everywhere.',
    flow: ['Record updated', 'AI validates', 'Conflict check', 'Syncs to all tools', 'Logs the change'],
    screenshotLabel: 'Screenshot: Data sync workflow in the builder',
  },
]

export function UseCasesSection() {
  const [selected, setSelected] = useState(useCases[0])

  return (
    <section id="use-cases" className="relative px-4 sm:px-6 lg:px-8 py-24">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-14">
          <h2 className="font-[var(--font-space-grotesk)] text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-3">
            What people build with it
          </h2>
        </div>

        {/* Tabs — simple text links, not pill buttons */}
        <div className="flex gap-6 mb-10 border-b border-slate-200 dark:border-slate-800">
          {useCases.map((uc) => (
            <button
              key={uc.id}
              onClick={() => setSelected(uc)}
              className={`pb-3 text-sm font-medium transition-colors relative ${
                selected.id === uc.id
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              {uc.tab}
              {selected.id === uc.id && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500"
                />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="grid lg:grid-cols-2 gap-12 items-start">
              {/* Left: Story */}
              <div>
                <h3 className="font-[var(--font-space-grotesk)] text-2xl font-bold text-slate-900 dark:text-white mb-4">
                  {selected.headline}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                  <span className="text-slate-900 dark:text-white font-medium">The problem: </span>
                  {selected.pain}
                </p>
                <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                  <span className="text-slate-900 dark:text-white font-medium">With ChainReact: </span>
                  {selected.outcome}
                </p>

                {/* Flow — minimal, inline */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {selected.flow.map((step, index) => (
                    <React.Fragment key={index}>
                      <span className="text-slate-700 dark:text-slate-300 font-medium">{step}</span>
                      {index < selected.flow.length - 1 && (
                        <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Right: Screenshot */}
              <div>
                <PlaceholderMedia
                  label={selected.screenshotLabel}
                  aspectRatio="16/10"
                  type="screenshot"
                />
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
