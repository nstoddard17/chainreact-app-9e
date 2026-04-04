"use client"

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ChevronRight, Headphones, DollarSign, PenTool, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { PlaceholderMedia } from './PlaceholderMedia'

interface UseCase {
  id: string
  tab: string
  icon: React.ElementType
  tagline: string
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
    icon: Headphones,
    tagline: 'Triage in seconds, not hours',
    headline: 'Customer emails → resolved tickets',
    pain: 'Your team spends 2 hours every morning triaging the inbox.',
    outcome: 'AI reads each email, pulls context from your docs, drafts a response, and flags anything it\'s unsure about. You approve with one click.',
    flow: ['Email arrives', 'AI reads + classifies', 'Pulls relevant docs', 'You approve or correct', 'Response sent'],
    screenshotLabel: 'CAPTURE: Screenshot of a support workflow in /workflows/builder showing: Gmail trigger → AI classifier → Google Docs lookup → AI draft response → approval node. Show the full canvas with connections visible.',
  },
  {
    id: 'sales',
    tab: 'Sales',
    icon: DollarSign,
    tagline: 'Close deals, not browser tabs',
    headline: 'Payments → CRM updates → team notifications',
    pain: 'Someone on your team manually copies Stripe data into HubSpot after every deal.',
    outcome: 'Payment comes in, AI extracts the details, updates your CRM, and posts to the right Slack channel — all in under a second.',
    flow: ['Stripe payment', 'AI extracts details', 'Updates HubSpot', 'Routes by deal size', 'Slack notification'],
    screenshotLabel: 'CAPTURE: Screenshot of a sales workflow in /workflows/builder showing: Stripe trigger → AI data extraction → HubSpot update → AI Router (by deal size) → Slack notification. Show the full canvas.',
  },
  {
    id: 'marketing',
    tab: 'Content',
    icon: PenTool,
    tagline: 'Write once, publish everywhere',
    headline: 'One post → five platforms',
    pain: 'You write a blog post, then spend an hour reformatting it for Twitter, LinkedIn, and email.',
    outcome: 'Publish in Notion, and AI automatically reformats for each platform, matches your brand voice, and schedules everything.',
    flow: ['Post published', 'AI reformats per platform', 'Matches brand voice', 'Schedules posts', 'Tracks engagement'],
    screenshotLabel: 'CAPTURE: Screenshot of a content workflow in /workflows/builder showing: Notion trigger → AI reformat (per platform) → Twitter post → LinkedIn post → email campaign node. Show the branching layout.',
  },
  {
    id: 'operations',
    tab: 'Ops',
    icon: RefreshCw,
    tagline: 'Keep everything in sync',
    headline: 'Keep three tools in sync without thinking about it',
    pain: 'You update a record in Airtable and then have to manually mirror it in Notion and HubSpot.',
    outcome: 'Change one record, AI validates it against your business rules, checks for conflicts, and syncs everywhere.',
    flow: ['Record updated', 'AI validates', 'Conflict check', 'Syncs to all tools', 'Logs the change'],
    screenshotLabel: 'CAPTURE: Screenshot of a data sync workflow in /workflows/builder showing: Airtable trigger → AI validation → conflict check → parallel sync to Notion + HubSpot → log node. Show connections between nodes.',
  },
]

export function UseCasesSection() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [selected, setSelected] = useState(useCases[0])

  return (
    <section id="use-cases" className="relative px-4 sm:px-6 lg:px-8 py-16">
      <div className="max-w-6xl mx-auto">
        {/* Header — centered */}
        <div className="text-center mb-10">
          <h2 className="font-[var(--font-space-grotesk)] text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-3">
            What people build with it
          </h2>
        </div>

        {/* Use case selector — visual cards, not generic tabs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {useCases.map((uc) => {
            const Icon = uc.icon
            const isSelected = selected.id === uc.id
            return (
              <button
                key={uc.id}
                onClick={() => setSelected(uc)}
                className={`relative text-left p-4 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-500/10 ring-1 ring-orange-500/20 scale-[1.02] shadow-sm'
                    : 'border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${
                  isSelected
                    ? 'bg-orange-100 dark:bg-orange-500/20'
                    : 'bg-slate-100 dark:bg-slate-800'
                }`}>
                  <Icon className={`w-4 h-4 ${
                    isSelected
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`} />
                </div>
                <div className={`text-sm font-semibold mb-0.5 ${
                  isSelected
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}>
                  {uc.tab}
                </div>
                <div className={`text-xs ${
                  isSelected
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}>
                  {uc.tagline}
                </div>
              </button>
            )
          })}
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
            <div className="grid lg:grid-cols-2 gap-10 items-start rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900/40 shadow-sm p-8">
              {/* Left: Story */}
              <div>
                <h3 className="font-[var(--font-space-grotesk)] text-2xl font-bold text-slate-900 dark:text-white mb-4">
                  {selected.headline}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                  <span className="text-slate-900 dark:text-white font-medium">The problem: </span>
                  {selected.pain}
                </p>
                <p className="text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                  <span className="text-slate-900 dark:text-white font-medium">With ChainReact: </span>
                  {selected.outcome}
                </p>

                {/* Flow — pill steps */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mb-6">
                  {selected.flow.map((step, index) => (
                    <React.Fragment key={index}>
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium px-2 py-1 rounded">
                        {step}
                      </span>
                      {index < selected.flow.length - 1 && (
                        <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                      )}
                    </React.Fragment>
                  ))}
                </div>

                <button
                  onClick={() => router.push(user ? '/workflows' : '/auth/login')}
                  className="text-sm font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 transition-colors inline-flex items-center gap-1"
                >
                  Build this with AI
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
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
