"use client"

import React, { useState } from 'react'
import Image from 'next/image'
import { Headphones, DollarSign, PenTool, RefreshCw, ArrowDown, Sparkles } from 'lucide-react'

interface FlowStep {
  label: string
  icon?: string  // path to integration logo
  isAI?: boolean // use AI sparkle icon instead
  invertIcon?: boolean // invert white logos for visibility
  externalUrl?: string // link out to external product
}

interface UseCase {
  id: string
  tab: string
  tabIcon: React.ElementType
  headline: string
  description: string
  flow: FlowStep[]
}

const useCases: UseCase[] = [
  {
    id: 'support',
    tab: 'Support',
    tabIcon: Headphones,
    headline: 'Triage in seconds, not hours',
    description: 'Email arrives, AI classifies priority, searches docs for a solution, drafts a response, and routes through OKRunit for human approval before sending.',
    flow: [
      { label: 'Email arrives', icon: '/integrations/gmail.svg' },
      { label: 'AI classifies priority', isAI: true },
      { label: 'Searches docs', icon: '/integrations/google-docs.svg' },
      { label: 'Drafts response', isAI: true },
      { label: 'Human approves via OKRunit', icon: '/integrations/okrunit.png', externalUrl: 'https://okrunit.com' },
    ],
  },
  {
    id: 'sales',
    tab: 'Sales',
    tabIcon: DollarSign,
    headline: 'Close deals, not browser tabs',
    description: 'Stripe payment triggers AI to extract details, update HubSpot, route by value, and notify your team.',
    flow: [
      { label: 'Stripe payment', icon: '/integrations/stripe.svg' },
      { label: 'AI extracts details', isAI: true },
      { label: 'Updates HubSpot', icon: '/integrations/hubspot.svg' },
      { label: 'Routes by value', isAI: true },
      { label: 'Notifies Slack', icon: '/integrations/slack.svg' },
    ],
  },
  {
    id: 'content',
    tab: 'Content',
    tabIcon: PenTool,
    headline: 'Write once, publish everywhere',
    description: 'Notion draft is reformatted by AI for each platform, then scheduled to Twitter, LinkedIn, and email.',
    flow: [
      { label: 'Notion draft', icon: '/integrations/notion.svg' },
      { label: 'AI reformats', isAI: true },
      { label: 'Posts to X', icon: '/integrations/x.svg' },
      { label: 'Posts to LinkedIn', icon: '/integrations/linkedin.svg' },
      { label: 'Sends email', icon: '/integrations/gmail.svg' },
    ],
  },
  {
    id: 'ops',
    tab: 'Ops',
    tabIcon: RefreshCw,
    headline: 'Keep everything in sync',
    description: 'Airtable update triggers AI validation, flags conflicts for human approval, then syncs to all tools.',
    flow: [
      { label: 'Airtable update', icon: '/integrations/airtable.svg' },
      { label: 'AI validates data', isAI: true },
      { label: 'Flags conflicts for review', icon: '/integrations/okrunit.png', externalUrl: 'https://okrunit.com' },
      { label: 'Syncs to Notion', icon: '/integrations/notion.svg' },
      { label: 'Updates HubSpot', icon: '/integrations/hubspot.svg' },
    ],
  },
]

export function UseCasesSection() {
  const [activeId, setActiveId] = useState(useCases[0].id)
  const selected = useCases.find((uc) => uc.id === activeId) ?? useCases[0]

  return (
    <section id="use-cases" className="px-4 sm:px-6 lg:px-8 py-24 bg-slate-900">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-4">
            Built for every team
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-center gap-1 mb-10">
          {useCases.map((uc) => {
            const isActive = uc.id === activeId
            const TabIcon = uc.tabIcon
            return (
              <button
                key={uc.id}
                onClick={() => setActiveId(uc.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-slate-900'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <TabIcon className="w-3.5 h-3.5" />
                {uc.tab}
              </button>
            )
          })}
        </div>

        {/* Content card - two columns */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 sm:p-10">
          <div className="grid lg:grid-cols-2 gap-10 items-start">
            {/* Left: Text */}
            <div>
              <h3 className="text-xl sm:text-2xl font-semibold text-white mb-3">
                {selected.headline}
              </h3>
              <p className="text-slate-400 text-base leading-relaxed mb-6">
                {selected.description}
              </p>
              <p className="text-xs text-slate-400">
                Each step runs automatically. AI nodes are marked with a sparkle.
              </p>
              {selected.flow.some((s) => s.externalUrl) && (
                <p className="text-xs text-slate-500 mt-3">
                  Human approval powered by{' '}
                  <a
                    href="https://okrunit.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    OKRunit
                  </a>
                  , our approval gateway for automations and AI agents.
                </p>
              )}
            </div>

            {/* Right: Visual flow */}
            <div className="flex flex-col items-center gap-1">
              {selected.flow.map((step, index) => {
                const stepContent = (
                  <div className={`w-full flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 transition-colors ${
                    step.externalUrl ? 'hover:border-slate-600 cursor-pointer group' : ''
                  }`}>
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      step.isAI
                        ? 'bg-orange-500/10 border border-orange-500/20'
                        : step.externalUrl
                          ? 'bg-slate-800 border border-emerald-500/30'
                          : 'bg-slate-800 border border-slate-700'
                    }`}>
                      {step.isAI ? (
                        <Sparkles className="w-4 h-4 text-orange-500" />
                      ) : step.icon ? (
                        <Image
                          src={step.icon}
                          alt=""
                          width={step.externalUrl ? 24 : 18}
                          height={step.externalUrl ? 24 : 18}
                          className={`object-contain ${step.invertIcon ? 'invert' : ''}`}
                        />
                      ) : null}
                    </div>
                    {/* Label */}
                    <span className="text-sm font-medium text-slate-300">{step.label}</span>
                    {/* AI badge */}
                    {step.isAI && (
                      <span className="ml-auto text-[10px] font-medium text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded">
                        AI
                      </span>
                    )}
                    {/* External link badge */}
                    {step.externalUrl && (
                      <span className="ml-auto text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded group-hover:bg-emerald-500/20 transition-colors">
                        Approval
                      </span>
                    )}
                  </div>
                )

                return (
                  <React.Fragment key={index}>
                    {step.externalUrl ? (
                      <a href={step.externalUrl} target="_blank" rel="noopener noreferrer" className="w-full">
                        {stepContent}
                      </a>
                    ) : (
                      stepContent
                    )}
                    {/* Connector arrow */}
                    {index < selected.flow.length - 1 && (
                      <div className="flex items-center justify-center h-5">
                        <ArrowDown className="w-3.5 h-3.5 text-slate-600" />
                      </div>
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
