"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
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
    description: 'Drag-and-drop interface to design complex workflows. No coding required, but power users can add custom logic.',
    color: 'from-blue-500 to-blue-600'
  },
  {
    icon: Eye,
    title: 'Real-Time Monitoring',
    description: 'Watch your workflows run in real-time. See exactly where AI pauses for HITL and track every decision.',
    color: 'from-purple-500 to-purple-600'
  },
  {
    icon: GitBranch,
    title: 'Conditional Logic',
    description: 'Branch workflows based on AI decisions, user input, or data conditions. As simple or complex as you need.',
    color: 'from-pink-500 to-pink-600'
  },
  {
    icon: Clock,
    title: 'Scheduling & Triggers',
    description: 'Run workflows on a schedule, trigger from webhooks, or start manually. Full control over when things happen.',
    color: 'from-green-500 to-green-600'
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Bank-grade encryption, OAuth flows, secure credential storage. Your data is protected at every step.',
    color: 'from-orange-500 to-orange-600'
  },
  {
    icon: Zap,
    title: 'Fast Execution',
    description: 'Workflows run in milliseconds. Our engine is optimized for speed without sacrificing reliability.',
    color: 'from-yellow-500 to-yellow-600'
  },
  {
    icon: BarChart3,
    title: 'Analytics & Insights',
    description: 'Track AI accuracy improvements over time. See which workflows save you the most time and where to optimize.',
    color: 'from-indigo-500 to-indigo-600'
  },
  {
    icon: Code,
    title: 'Template Library',
    description: 'Start with pre-built templates for common use cases. Customize to fit your exact needs.',
    color: 'from-teal-500 to-teal-600'
  },
  {
    icon: Boxes,
    title: 'Version Control',
    description: 'Track workflow changes, roll back to previous versions, and test new iterations safely.',
    color: 'from-cyan-500 to-cyan-600'
  }
]

export function FlexibilitySection() {
  return (
    <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 lg:py-24 bg-gradient-to-br from-white/50 to-blue-50/30 dark:from-slate-900/50 dark:to-blue-900/10">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <Badge variant="secondary" className="bg-blue-600/20 text-blue-300 dark:text-blue-300 border border-blue-500/30 mb-4">
            <Boxes className="w-3 h-3 mr-1" />
            Built for Flexibility
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            All the Features You'd Expect
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            The trainable AI is our secret sauce, but we didn't skip the fundamentals.
            ChainReact is a complete workflow automation platform.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10 h-full hover:shadow-xl transition-shadow duration-300">
                  <CardContent className="p-6">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center text-white mb-4`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>

        {/* Flex Factor Highlight */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Card className="bg-gradient-to-br from-blue-500 to-purple-500 border-0 text-white">
            <CardContent className="p-8 md:p-12">
              <div className="text-center max-w-3xl mx-auto">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-6">
                  <Workflow className="w-8 h-8" />
                </div>
                <h3 className="text-2xl md:text-3xl font-bold mb-4">
                  The "Flex Factor"
                </h3>
                <p className="text-lg text-blue-100 mb-6 leading-relaxed">
                  Most workflow tools force you to think like a programmer. ChainReact adapts to how <strong>you</strong> think.
                  Build the same workflow 5 different ways depending on your preferences. The AI learns your unique approach
                  and gets better at predicting what you want.
                </p>
                <div className="grid md:grid-cols-3 gap-6 mt-8">
                  <div className="p-4 rounded-xl bg-white/10 backdrop-blur">
                    <div className="text-3xl font-bold mb-1">∞</div>
                    <div className="text-sm text-blue-100">Ways to build the same workflow</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/10 backdrop-blur">
                    <div className="text-3xl font-bold mb-1">100%</div>
                    <div className="text-sm text-blue-100">Yours—AI learns YOUR way</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/10 backdrop-blur">
                    <div className="text-3xl font-bold mb-1">0</div>
                    <div className="text-sm text-blue-100">Rigid templates to follow</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}
