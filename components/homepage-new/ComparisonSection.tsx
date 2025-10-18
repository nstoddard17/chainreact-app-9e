"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Brain,
  Zap,
  TrendingUp,
  CheckCircle,
  XCircle,
  MessageSquare,
  Lightbulb
} from 'lucide-react'

export function ComparisonSection() {
  return (
    <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 lg:py-24 bg-gradient-to-br from-white/50 to-purple-50/30 dark:from-slate-900/50 dark:to-purple-900/10">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <Badge variant="secondary" className="bg-blue-600/20 text-blue-300 dark:text-blue-300 border border-blue-500/30 mb-4">
            <Lightbulb className="w-3 h-3 mr-1" />
            What Makes Us Different
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Not Another Zapier Clone
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Yes, there are 100 workflow automation tools. And 50 of them just slapped "AI" on Zapier.
            <br />
            <span className="font-semibold text-gray-900 dark:text-white">Here's what we do differently:</span>
          </p>
        </div>

        {/* Comparison Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* Traditional Tools */}
          <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-red-200 dark:border-red-500/20">
            <CardContent className="p-6">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 mb-3">
                  <XCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Traditional Tools
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Zapier, Make.com, n8n
                </p>
              </div>

              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">
                    Set rules once, they stay dumb forever
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">
                    No understanding of your business context
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">
                    Break when your process changes
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">
                    Require constant manual updates
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Generic AI Tools */}
          <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-yellow-200 dark:border-yellow-500/20">
            <CardContent className="p-6">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 mb-3">
                  <Brain className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  "AI-Powered" Tools
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Clay, Bardeen, etc.
                </p>
              </div>

              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">
                    AI fills in fields automatically
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">
                    But workflows are still static
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">
                    No learning or adaptation
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">
                    Generic AI with no business context
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* ChainReact */}
          <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-500/10 dark:to-purple-500/10 border-2 border-blue-500 dark:border-blue-400 shadow-xl shadow-blue-500/20">
            <CardContent className="p-6">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white mb-3">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  ChainReact
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 font-semibold">
                  Trainable AI Copilot
                </p>
              </div>

              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-900 dark:text-white font-medium">
                    AI learns YOUR business logic
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-900 dark:text-white font-medium">
                    Human-in-the-loop training
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-900 dark:text-white font-medium">
                    Gets smarter with every correction
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-900 dark:text-white font-medium">
                    90% autonomous after 6 months
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Key Differentiators */}
        <div className="grid md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10 h-full">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      HITL: Our Secret Weapon
                    </h3>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      When AI isn't sure, the workflow pauses and asks you. Your corrections don't just fix the immediate
                      issue—they train your AI to handle similar situations autonomously in the future. It's like having
                      an intern that actually learns.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Card className="bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl border-white/60 dark:border-white/10 h-full">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Your Data = Your Competitive Moat
                    </h3>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      Every correction makes YOUR AI smarter. Not anyone else's. After months of training, your AI
                      knows your edge cases, terminology, and preferences. That institutional knowledge becomes
                      irreplaceable—and impossible to switch away from.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Why This Matters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-8"
        >
          <Card className="bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 border-blue-200 dark:border-blue-500/30">
            <CardContent className="p-6 md:p-8 text-center">
              <Zap className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                The Bottom Line
              </h3>
              <p className="text-lg text-gray-700 dark:text-gray-300 max-w-3xl mx-auto">
                Other tools make you think like a programmer.{' '}
                <span className="font-semibold text-gray-900 dark:text-white">
                  ChainReact learns to think like you.
                </span>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}
