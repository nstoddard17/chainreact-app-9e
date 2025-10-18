"use client"

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
      'Human Collaboration: AI drafts response, asks for approval if needed',
      'Send response, update HubSpot, post to Slack'
    ],
    roi: 'Save 10-15 hours per week',
    keyFeatures: ['AI Router', 'Document search', 'Human collaboration']
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
    roi: 'Reduce data entry by 80%',
    keyFeatures: ['Real-time triggers', 'Smart routing', 'Multi-system updates']
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
      'AI Message: Formats for each platform',
      'AI Router: Determines which platforms based on content',
      'Post to all platforms, track engagement'
    ],
    roi: 'Publish to 5+ platforms instantly',
    keyFeatures: ['Platform formatting', 'AI Message', 'Scheduling']
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
      'Human Collaboration: Flags anomalies for human review',
      'Sync to Notion, HubSpot, send notifications'
    ],
    roi: 'Reduce sync time by 90%',
    keyFeatures: ['Bidirectional sync', 'Conflict detection', 'Real-time monitoring']
  }
]

export function UseCasesSection() {
  const [selectedCase, setSelectedCase] = useState<UseCase>(useCases[0])

  return (
    <section id="use-cases" className="relative px-4 sm:px-6 lg:px-8 py-24 border-t border-gray-100 dark:border-gray-800">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge className="bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/20 mb-4">
            <Sparkles className="w-3 h-3 mr-1" />
            Use Cases
          </Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            See What You Can Build
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Real workflows, real results. Here's what teams are building with ChainReact.
          </p>
        </div>

        {/* Use Case Tabs - Cleaner design */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {useCases.map((useCase) => {
            const Icon = useCase.icon
            return (
              <button
                key={useCase.id}
                onClick={() => setSelectedCase(useCase)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCase.id === useCase.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {useCase.title}
              </button>
            )
          })}
        </div>

        {/* Selected Use Case - Clean layout */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedCase.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="max-w-4xl mx-auto"
          >
            {/* Header */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-blue-100 dark:bg-blue-500/10 mb-2">
                {React.createElement(selectedCase.icon, { className: "w-7 h-7 text-blue-600 dark:text-blue-400" })}
              </div>
              <div className="mb-3">
                <Badge className="bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/20">
                  {selectedCase.category}
                </Badge>
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-3">
                {selectedCase.title}
              </h3>
              <p className="text-base text-gray-600 dark:text-gray-400">
                {selectedCase.description}
              </p>
            </div>

            {/* Workflow Steps */}
            <div className="mb-10">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">How It Works:</h4>
              <div className="space-y-3">
                {selectedCase.workflow.map((step, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-gray-700"
                  >
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">
                      {index + 1}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      {step}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Results Grid */}
            <div className="grid md:grid-cols-3 gap-6">
              {/* ROI */}
              <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-500/5 border border-green-200 dark:border-green-500/20">
                <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400 mx-auto mb-2" />
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Time Savings</div>
                <div className="text-sm font-bold text-green-700 dark:text-green-300">{selectedCase.roi}</div>
              </div>

              {/* Build Time */}
              <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20">
                <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Build Time</div>
                <div className="text-sm font-bold text-blue-700 dark:text-blue-300">15-30 minutes</div>
              </div>

              {/* Features */}
              <div className="text-center p-4 rounded-lg bg-purple-50 dark:bg-purple-500/5 border border-purple-200 dark:border-purple-500/20">
                <Zap className="w-6 h-6 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Key Features</div>
                <div className="text-xs text-purple-700 dark:text-purple-300">
                  {selectedCase.keyFeatures.join(', ')}
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-10 text-center">
              <Button
                onClick={() => window.location.href = '/waitlist'}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Build This Workflow
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
