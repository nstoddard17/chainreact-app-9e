"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import {
  Workflow,
  Eye,
  GitBranch,
  Clock,
  Shield,
  Zap,
  BarChart3,
  Code,
  Boxes
} from 'lucide-react'

const features = [
  {
    icon: Workflow,
    title: 'Visual Workflow Builder',
    description: 'Drag-and-drop interface to design complex workflows. No coding required, but power users can add custom logic.'
  },
  {
    icon: Eye,
    title: 'Real-Time Monitoring',
    description: 'Watch your workflows run in real-time. See exactly where AI pauses for HITL and track every decision.'
  },
  {
    icon: GitBranch,
    title: 'Conditional Logic',
    description: 'Branch workflows based on AI decisions, user input, or data conditions. As simple or complex as you need.'
  },
  {
    icon: Clock,
    title: 'Scheduling & Triggers',
    description: 'Run workflows on a schedule, trigger from webhooks, or start manually. Full control over when things happen.'
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Bank-grade encryption, OAuth flows, secure credential storage. Your data is protected at every step.'
  },
  {
    icon: Zap,
    title: 'Fast Execution',
    description: 'Workflows run in milliseconds. Our engine is optimized for speed without sacrificing reliability.'
  },
  {
    icon: BarChart3,
    title: 'Analytics & Insights',
    description: 'Track AI accuracy improvements over time. See which workflows save you the most time and where to optimize.'
  },
  {
    icon: Code,
    title: 'Template Library',
    description: 'Start with pre-built templates for common use cases. Customize to fit your exact needs.'
  },
  {
    icon: Boxes,
    title: 'Version Control',
    description: 'Track workflow changes, roll back to previous versions, and test new iterations safely.'
  }
]

export function FlexibilitySection() {
  return (
    <section id="features" className="relative px-4 sm:px-6 lg:px-8 py-24 border-t border-gray-100 dark:border-gray-800">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge className="bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/20 mb-4">
            <Boxes className="w-3 h-3 mr-1" />
            Platform Features
          </Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Everything You Need
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            A complete workflow automation platform with intelligent AI capabilities
          </p>
        </div>

        {/* Features Grid - Clean minimal cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className="group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 dark:group-hover:bg-blue-500/20 transition-colors">
                    <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
