"use client"

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Mail,
  DollarSign,
  MessageSquare,
  FileText,
  TrendingUp,
  Users,
  ArrowRight,
  CheckCircle,
  Brain,
  Sparkles
} from 'lucide-react'

interface UseCase {
  id: string
  title: string
  category: string
  icon: any
  description: string
  workflow: string[]
  roi: string
  aiLearns: string
}

const useCases: UseCase[] = [
  {
    id: 'customer-support',
    title: 'Customer Support Triage',
    category: 'Support',
    icon: Mail,
    description: 'Automatically categorize and route customer emails based on content, urgency, and your business rules.',
    workflow: [
      'Gmail trigger: New email received',
      'AI reads and analyzes email content',
      'HITL: AI suggests category (Refund/Question/Bug)',
      'You correct when wrong → AI learns',
      'Route to Notion, create HubSpot task, send templated response'
    ],
    roi: 'Save 10-15 hours/week',
    aiLearns: 'Your refund policy, product nuances, priority rules'
  },
  {
    id: 'sales-pipeline',
    title: 'Sales Pipeline Management',
    category: 'Sales',
    icon: DollarSign,
    description: 'Keep your CRM updated automatically when payments come in, with AI learning your deal stages and qualification criteria.',
    workflow: [
      'Stripe: Payment received',
      'AI extracts deal details and context',
      'HITL: AI suggests HubSpot field updates',
      'Sales lead corrects → AI learns',
      'Update HubSpot, post to Slack, create follow-up tasks'
    ],
    roi: 'Onboard new sales reps 3x faster',
    aiLearns: 'Deal stages, qualification criteria, priority scoring'
  },
  {
    id: 'content-distribution',
    title: 'Content Distribution',
    category: 'Marketing',
    icon: MessageSquare,
    description: 'Publish content across multiple platforms with AI learning your brand voice, formatting preferences, and platform-specific tweaks.',
    workflow: [
      'Notion: New blog post published',
      'AI formats for each platform (Twitter, LinkedIn, Discord)',
      'HITL: AI shows formatted posts for review',
      'You refine → AI learns your style',
      'Post to all platforms, track engagement'
    ],
    roi: 'Publish to 5 platforms in the time it takes to do 1',
    aiLearns: 'Brand voice, formatting preferences, platform nuances'
  },
  {
    id: 'data-sync',
    title: 'Multi-System Data Sync',
    category: 'Operations',
    icon: FileText,
    description: 'Keep data synchronized across Airtable, Notion, and HubSpot with AI learning your data relationships and validation rules.',
    workflow: [
      'Airtable: Record updated',
      'AI synthesizes data across 3 systems',
      'HITL: AI suggests field mappings and updates',
      'Domain expert corrects → AI learns',
      'Update Notion, HubSpot, send notifications'
    ],
    roi: 'Reduce data errors by 80%',
    aiLearns: 'Field relationships, validation rules, data formats'
  }
]

export function UseCasesSection() {
  const [selectedCase, setSelectedCase] = useState<UseCase>(useCases[0])

  return (
    <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <Badge variant="secondary" className="bg-green-600/20 text-green-300 dark:text-green-300 border border-green-500/30 mb-4">
            <Sparkles className="w-3 h-3 mr-1" />
            Real Use Cases
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Workflows People Actually Build
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Stop imagining possibilities. Here's what customers are building right now.
          </p>
        </div>

        {/* Use Case Tabs */}
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {useCases.map((useCase) => {
            const Icon = useCase.icon
            return (
              <Button
                key={useCase.id}
                onClick={() => setSelectedCase(useCase)}
                variant={selectedCase.id === useCase.id ? "default" : "outline"}
                className={`${
                  selectedCase.id === useCase.id
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0'
                    : 'border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {useCase.title}
              </Button>
            )
          })}
        </div>

        {/* Selected Use Case Details */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedCase.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Left: Workflow Steps */}
              <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white flex-shrink-0">
                      {React.createElement(selectedCase.icon, { className: "w-6 h-6" })}
                    </div>
                    <div>
                      <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-300 border-0 mb-2">
                        {selectedCase.category}
                      </Badge>
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {selectedCase.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        {selectedCase.description}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      Workflow Steps:
                    </h4>
                    {selectedCase.workflow.map((step, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-900/50"
                      >
                        <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">
                          {index + 1}
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                          {step}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Right: Results & Learning */}
              <div className="space-y-6">
                {/* ROI Card */}
                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-500/10 dark:to-emerald-500/10 border-green-200 dark:border-green-500/20">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white flex-shrink-0">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                          Expected ROI
                        </h4>
                        <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                          {selectedCase.roi}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* AI Learning Card */}
                <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-500/10 dark:to-pink-500/10 border-purple-200 dark:border-purple-500/20">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white flex-shrink-0">
                        <Brain className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                          What AI Learns
                        </h4>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {selectedCase.aiLearns}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Training Timeline */}
                <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10">
                  <CardContent className="p-6">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-500" />
                      Typical Training Journey
                    </h4>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-300 border-0 mt-0.5">
                          Week 1
                        </Badge>
                        <div className="flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            AI asks for help on ~80% of decisions
                          </p>
                          <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                            <div className="h-full w-[20%] bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Badge className="bg-purple-500/20 text-purple-700 dark:text-purple-300 border-0 mt-0.5">
                          Month 3
                        </Badge>
                        <div className="flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            AI asks for help on ~20% of decisions
                          </p>
                          <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                            <div className="h-full w-[80%] bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-0 mt-0.5">
                          Month 6
                        </Badge>
                        <div className="flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            AI handles 95% autonomously
                          </p>
                          <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                            <div className="h-full w-[95%] bg-gradient-to-r from-green-500 to-emerald-500 rounded-full" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* CTA */}
                <Card className="bg-gradient-to-r from-blue-500 to-purple-500 border-0 text-white">
                  <CardContent className="p-6 text-center">
                    <h4 className="text-xl font-bold mb-2">
                      Ready to build this?
                    </h4>
                    <p className="text-sm text-blue-100 mb-4">
                      Join the waitlist to get early access
                    </p>
                    <Button
                      className="bg-white text-blue-600 hover:bg-gray-100"
                      onClick={() => window.location.href = '/waitlist'}
                    >
                      Get Started
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* All Integrations Available */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-16"
        >
          <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10">
            <CardContent className="p-6 md:p-8">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  20+ Deep Integrations Available
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Not just API connections—real webhook support, OAuth flows, and field-level control
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {['Gmail', 'Slack', 'Discord', 'Notion', 'HubSpot', 'Stripe', 'Airtable', 'Shopify', 'Drive', 'OneDrive', 'Trello', 'Facebook', 'Twitter', 'LinkedIn', 'Instagram'].map((integration) => (
                  <div
                    key={integration}
                    className="flex items-center justify-center p-3 rounded-lg bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {integration}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}
