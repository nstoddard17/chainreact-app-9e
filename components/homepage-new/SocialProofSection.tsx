"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowRight,
  Users,
  TrendingUp,
  Sparkles,
  CheckCircle,
  Rocket,
  Clock,
  Target
} from 'lucide-react'
import { useRouter } from 'next/navigation'

export function SocialProofSection() {
  const router = useRouter()

  return (
    <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
      <div className="max-w-7xl mx-auto">
        {/* Current State Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-500/10 dark:to-purple-500/10 border-blue-200 dark:border-blue-500/20">
            <CardContent className="p-6 md:p-8">
              <div className="text-center">
                <Badge className="bg-green-500 text-white border-0 mb-4">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse mr-2" />
                  Currently in Public Beta
                </Badge>
                <h3 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">
                  We're Building This in Public
                </h3>
                <p className="text-lg text-gray-700 dark:text-gray-300 max-w-3xl mx-auto">
                  ChainReact is live and actively being developed. We're transparent about what works today,
                  what we're building next, and the vision we're working toward.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* What Works Today vs What's Coming */}
        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          {/* What Works Today */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10 h-full">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-green-500 flex items-center justify-center text-white">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      What Works Today
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Live and ready to use
                    </p>
                  </div>
                </div>

                <ul className="space-y-3">
                  {[
                    '20+ deep integrations with OAuth & webhooks',
                    'Visual workflow builder with drag-and-drop',
                    'HITL actions for human-in-the-loop training',
                    'AI Router for intelligent decision routing',
                    'AI Message actions for context-aware responses',
                    'Real-time workflow monitoring',
                    'Workflow templates library',
                    'Scheduled & triggered executions'
                  ].map((item, idx) => (
                    <motion.li
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-start gap-2"
                    >
                      <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {item}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>

          {/* What We're Building */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10 h-full">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center text-white">
                    <Rocket className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      What We're Building
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Coming in the next 3-6 months
                    </p>
                  </div>
                </div>

                <ul className="space-y-3">
                  {[
                    'Advanced AI accuracy metrics & dashboards',
                    'Team collaboration & shared workflows',
                    'Custom integration builder (bring your own API)',
                    'Workflow version control & rollback',
                    'Advanced analytics & performance insights',
                    'Mobile app for workflow monitoring',
                    'AI model fine-tuning on your data',
                    'Marketplace for trained AI workflows'
                  ].map((item, idx) => (
                    <motion.li
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-start gap-2"
                    >
                      <Clock className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {item}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10">
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                  10,000+
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Workflows Trained
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10">
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                  20+
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Integrations
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10">
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
                  90%
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Autonomous After Training
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10">
              <CardContent className="p-6 text-center">
                <div className="text-3xl font-bold text-pink-600 dark:text-pink-400 mb-1">
                  24/7
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Workflow Monitoring
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* Final CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Card className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 border-0">
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
            <CardContent className="relative p-8 md:p-12 text-center text-white">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur mb-6">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-semibold">
                  Join the Future of Workflow Automation
                </span>
              </div>

              <h2 className="text-3xl md:text-5xl font-bold mb-6">
                Ready to Automate Your Workflow?
              </h2>

              <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-8">
                Get early access to ChainReact and start training your personal AI today.
                Limited spots available for beta users.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Button
                  size="lg"
                  onClick={() => router.push('/waitlist')}
                  className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-6 text-lg font-semibold rounded-xl shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-105 group"
                >
                  <Rocket className="w-5 h-5 mr-2" />
                  Join the Waitlist
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    const demoSection = document.getElementById('demo')
                    if (demoSection) {
                      demoSection.scrollIntoView({ behavior: 'smooth' })
                    }
                  }}
                  className="border-2 border-white text-white hover:bg-white/10 px-8 py-6 text-lg rounded-xl"
                >
                  Watch Demo Again
                </Button>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-6 text-blue-100">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm">No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm">Free during beta</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm">Early access benefits</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Honesty Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-12"
        >
          <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10">
            <CardContent className="p-6 md:p-8">
              <div className="text-center max-w-3xl mx-auto">
                <Target className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  Our Promise to You
                </h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  We're not going to oversell or overpromise. ChainReact is a powerful workflow automation tool
                  with a genuinely unique approach to AI training. We're building in public, shipping fast, and
                  listening to our users. If you want to be part of shaping the future of intelligent automation,
                  we'd love to have you on board.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}
