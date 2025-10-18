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
  ArrowRight,
  Brain,
  Sparkles,
  Zap,
  Clock
} from 'lucide-react'

interface UseCase {
  id: string
  title: string
  category: string
  icon: any
  description: string
  workflow: string[]
  roi: string
  keyFeatures: string[]
}

const useCases: UseCase[] = [
  {
    id: 'customer-support',
    title: 'Intelligent Customer Support',
    category: 'Support',
    icon: Mail,
    description: 'Automatically route and respond to customer emails using AI that accesses your knowledge base and collaborates with your team.',
    workflow: [
      'Gmail trigger: New customer email received',
      'AI analyzes email content and urgency',
      'AI searches Google Drive for relevant policies/docs',
      'HITL: AI drafts response, asks for approval if needed',
      'Send response, update HubSpot, post to Slack'
    ],
    roi: 'Save 10-15 hours per week on email triage and responses',
    keyFeatures: ['AI Router for smart categorization', 'Document search across Google Drive & Notion', 'HITL for quality control']
  },
  {
    id: 'sales-pipeline',
    title: 'Automated Sales Pipeline',
    category: 'Sales',
    icon: DollarSign,
    description: 'Keep your CRM synchronized automatically when payments come in, with intelligent routing based on deal size and type.',
    workflow: [
      'Stripe: Payment received',
      'AI extracts deal details and validates data',
      'AI Router: Routes to correct team based on deal size',
      'Update HubSpot fields, create tasks',
      'Post to Slack with @mentions, send follow-up emails'
    ],
    roi: 'Reduce data entry time by 80%, ensure zero missed follow-ups',
    keyFeatures: ['Real-time payment triggers', 'Smart routing by deal attributes', 'Multi-system updates in one workflow']
  },
  {
    id: 'content-distribution',
    title: 'Multi-Platform Publishing',
    category: 'Marketing',
    icon: MessageSquare,
    description: 'Publish content across multiple platforms automatically, with AI formatting each post for maximum engagement per platform.',
    workflow: [
      'Notion: New blog post published',
      'AI reads post and brand voice guidelines',
      'AI Message: Formats for each platform (Twitter, LinkedIn, Discord)',
      'AI Router: Determines which platforms based on content type',
      'Post to all platforms, track engagement'
    ],
    roi: 'Publish to 5+ platforms in the time it takes to do 1',
    keyFeatures: ['Platform-specific formatting', 'AI Message for context-aware posts', 'Scheduled publishing']
  },
  {
    id: 'data-sync',
    title: 'Cross-Platform Data Sync',
    category: 'Operations',
    icon: FileText,
    description: 'Keep data synchronized across Airtable, Notion, and HubSpot automatically with intelligent validation and conflict resolution.',
    workflow: [
      'Airtable: Record updated',
      'AI validates data against business rules',
      'AI checks for conflicts across systems',
      'HITL: Flags anomalies for human review',
      'Sync to Notion, HubSpot, send notifications'
    ],
    roi: 'Reduce manual data sync time by 90%, cut errors by 80%',
    keyFeatures: ['Bidirectional sync', 'Conflict detection', 'Real-time monitoring']
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
            See What You Can Build
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Real workflows, real results, real time savings. Here's what teams are building with ChainReact.
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
                      How It Works:
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

              {/* Right: Results & Features */}
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
                          Time Savings
                        </h4>
                        <p className="text-lg font-bold text-green-700 dark:text-green-300">
                          {selectedCase.roi}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Key Features Card */}
                <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-500/10 dark:to-pink-500/10 border-purple-200 dark:border-purple-500/20">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white flex-shrink-0">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                          Key Features Used
                        </h4>
                        <ul className="space-y-2">
                          {selectedCase.keyFeatures.map((feature, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                              <Zap className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Build Time Card */}
                <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white flex-shrink-0">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                          Build Time
                        </h4>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">15-30 min</span>
                          <span className="text-gray-600 dark:text-gray-400"> to build from scratch</span>
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Or start with a template and customize in minutes
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Workflow Complexity */}
                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-500/10 dark:to-indigo-500/10 border-blue-200 dark:border-blue-500/20">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white flex-shrink-0">
                        <Brain className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                          Intelligent Automation
                        </h4>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          This workflow combines AI Router for smart decisions, AI Message for context-aware
                          responses, and HITL for human oversight—all working together seamlessly.
                        </p>
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
                      Start with a template or build from scratch
                    </p>
                    <Button
                      className="bg-white text-blue-600 hover:bg-gray-100"
                      onClick={() => window.location.href = '/waitlist'}
                    >
                      Get Early Access
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
