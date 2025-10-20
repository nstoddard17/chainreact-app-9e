"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowRight,
  CheckCircle,
  Rocket,
  Clock,
  Code,
  Brain,
  Workflow,
  Zap,
  Sparkles,
  Target,
  Eye
} from 'lucide-react'
import { useRouter } from 'next/navigation'

export function SocialProofSection() {
  const router = useRouter()

  return (
    <section id="roadmap" className="relative px-4 sm:px-6 lg:px-8 py-24 border-t border-gray-100 dark:border-gray-800">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge className="bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/20 mb-4">
            Live & Ready
          </Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Built for Teams Who Move Fast
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Core features ready to use today, with exciting capabilities on the horizon
          </p>
        </div>

        {/* Two-column feature lists - MATCHING DESIGN */}
        <div className="grid lg:grid-cols-2 gap-12 mb-20">
          {/* Available Today */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Available Today
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Full-featured and ready to use
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { icon: Code, text: 'Visual workflow builder' },
                { icon: Brain, text: 'AI with document access' },
                { icon: Workflow, text: '20+ deep integrations' },
                { icon: Zap, text: 'Real-time monitoring' },
                { icon: CheckCircle, text: 'Human collaboration' },
                { icon: Sparkles, text: 'AI Router & AI Message' },
                { icon: Clock, text: 'Scheduled triggers' },
                { icon: Target, text: 'Template library' }
              ].map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900"
                >
                  <item.icon className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <span className="text-sm text-gray-900 dark:text-white">
                    {item.text}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* On the Roadmap - MATCHING DESIGN */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center">
                <Rocket className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  On the Roadmap
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Coming in the next 3-6 months
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { icon: Code, text: 'Team collaboration & shared workflows' },
                { icon: Eye, text: 'Advanced analytics dashboards' },
                { icon: Workflow, text: 'Custom integration builder' },
                { icon: Target, text: 'Workflow version control' },
                { icon: Zap, text: 'Mobile app for monitoring' },
                { icon: Brain, text: 'AI model fine-tuning options' },
                { icon: Sparkles, text: 'Workflow marketplace' },
                { icon: CheckCircle, text: 'Enterprise SSO & advanced security' }
              ].map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900"
                >
                  <item.icon className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <span className="text-sm text-gray-900 dark:text-white">
                    {item.text}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Stats - Clean minimal design */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-20">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
              10,000+
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Workflows Executed
            </div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
              20+
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Deep Integrations
            </div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
              &lt;100ms
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Avg Response Time
            </div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
              99.9%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Uptime
            </div>
          </div>
        </div>

        {/* Final CTA - Clean design */}
        <div className="max-w-3xl mx-auto text-center">
          <h3 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Ready to Automate Smarter?
          </h3>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            Join teams building intelligent workflows with AI that remembers, integrations that work,
            and automation that actually makes sense.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-8">
            <Button
              size="lg"
              onClick={() => router.push('/waitlist')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              Get Early Access
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              onClick={() => {
                const demoSection = document.getElementById('demo')
                if (demoSection) {
                  demoSection.scrollIntoView({ behavior: 'smooth' })
                }
              }}
              className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-6 py-3"
            >
              Watch Demo Again
            </Button>
          </div>

          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Free during beta</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Start with templates</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
