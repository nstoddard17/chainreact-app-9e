"use client"

import React, { useState } from 'react'
import Image from 'next/image'
import { Headphones, DollarSign, PenTool, RefreshCw, ArrowDown, Sparkles } from 'lucide-react'

interface FlowStep {
  label: string
  icon?: string  // path to integration logo
  isAI?: boolean // use AI sparkle icon instead
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
    description: 'Email arrives, AI classifies priority, searches docs for a solution, drafts a response, and routes for approval.',
    flow: [
      { label: 'Email arrives', icon: '/integrations/gmail.svg' },
      { label: 'AI classifies priority', isAI: true },
      { label: 'Searches docs', icon: '/integrations/google-docs.svg' },
      { label: 'Drafts response', isAI: true },
      { label: 'Routes for approval', icon: '/integrations/slack.svg' },
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
    description: 'Airtable update triggers AI validation, conflict checks, syncs to all tools, and logs every change.',
    flow: [
      { label: 'Airtable update', icon: '/integrations/airtable.svg' },
      { label: 'AI validates data', isAI: true },
      { label: 'Checks conflicts', isAI: true },
      { label: 'Syncs to Notion', icon: '/integrations/notion.svg' },
      { label: 'Updates HubSpot', icon: '/integrations/hubspot.svg' },
    ],
  },
]

export function UseCasesSection() {
  const [activeId, setActiveId] = useState(useCases[0].id)
  const selected = useCases.find((uc) => uc.id === activeId) ?? useCases[0]

  return (
    <section id="use-cases" className="px-4 sm:px-6 lg:px-8 py-24" style={{ backgroundColor: '#fafafa' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 mb-4">
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
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <TabIcon className="w-3.5 h-3.5" />
                {uc.tab}
              </button>
            )
          })}
        </div>

        {/* Content card — two columns */}
        <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-10">
          <div className="grid lg:grid-cols-2 gap-10 items-start">
            {/* Left: Text */}
            <div>
              <h3 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-3">
                {selected.headline}
              </h3>
              <p className="text-slate-500 text-base leading-relaxed mb-6">
                {selected.description}
              </p>
              <p className="text-xs text-slate-400">
                Each step runs automatically. AI nodes are marked with a sparkle.
              </p>
            </div>

            {/* Right: Visual flow */}
            <div className="flex flex-col items-center gap-1">
              {selected.flow.map((step, index) => (
                <React.Fragment key={index}>
                  <div className="w-full flex items-center gap-3 bg-slate-50 border border-slate-200/80 rounded-lg px-4 py-3 transition-colors">
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      step.isAI
                        ? 'bg-orange-50 border border-orange-200/60'
                        : 'bg-white border border-slate-200'
                    }`}>
                      {step.isAI ? (
                        <Sparkles className="w-4 h-4 text-orange-500" />
                      ) : step.icon ? (
                        <Image
                          src={step.icon}
                          alt=""
                          width={18}
                          height={18}
                          className="object-contain"
                        />
                      ) : null}
                    </div>
                    {/* Label */}
                    <span className="text-sm font-medium text-slate-700">{step.label}</span>
                    {/* AI badge */}
                    {step.isAI && (
                      <span className="ml-auto text-[10px] font-medium text-orange-500 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded">
                        AI
                      </span>
                    )}
                  </div>
                  {/* Connector arrow */}
                  {index < selected.flow.length - 1 && (
                    <div className="flex items-center justify-center h-5">
                      <ArrowDown className="w-3.5 h-3.5 text-slate-300" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
