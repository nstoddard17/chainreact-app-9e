"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowRight, Brain, TrendingUp, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function NewHeroSection() {
  const router = useRouter()

  return (
    <section id="overview" className="relative z-10 px-4 sm:px-6 lg:px-8 pt-20 pb-16 lg:pt-28 lg:pb-20">
      <div className="absolute inset-x-0 -top-32 h-80 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-transparent blur-3xl pointer-events-none" aria-hidden />
      <div className="max-w-7xl mx-auto">
        <div className="relative text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 dark:from-blue-500/10 to-purple-100 dark:to-purple-500/10 border border-blue-200 dark:border-blue-500/20 mb-8"
          >
            <Brain className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              AI That Learns Your Business
            </span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 text-gray-900 dark:text-white leading-tight"
          >
            Workflow automation
            <br />
            <span className="bg-gradient-to-r from-blue-600 dark:from-blue-400 via-purple-600 dark:via-purple-400 to-pink-600 dark:to-pink-400 bg-clip-text text-transparent">
              that learns your business
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl sm:text-2xl text-gray-600 dark:text-gray-300 max-w-4xl mx-auto mb-10 leading-relaxed"
          >
            Connect your apps. Train your AI. Scale your expertise.
            <br />
            <span className="text-lg sm:text-xl text-gray-500 dark:text-gray-400 mt-2 block">
              The more you use ChainReact, the less you need to.
            </span>
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Button
              size="lg"
              onClick={() => router.push('/waitlist')}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-6 text-lg font-semibold rounded-xl shadow-2xl shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-300 transform hover:scale-105 group"
            >
              <Zap className="w-5 h-5 mr-2" />
              Get Early Access
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
              className="border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5 px-8 py-6 text-lg rounded-xl transition-all"
            >
              <Brain className="w-5 h-5 mr-2" />
              See How It Works
            </Button>
          </motion.div>

          {/* Value Props */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto"
          >
            <div className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 flex items-center justify-center text-white font-bold text-lg">
                90%
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Autonomous After Training
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-center">
                Month 6: AI handles decisions without you
              </span>
            </div>

            <div className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
              <div className="flex items-center gap-1">
                <TrendingUp className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Gets Smarter Over Time
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-center">
                Every correction trains your personal AI
              </span>
            </div>

            <div className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-pink-600 dark:from-pink-400 dark:to-pink-500 flex items-center justify-center">
                <span className="text-white font-bold text-lg">20+</span>
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Deep Integrations
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-center">
                Gmail, Slack, HubSpot, Notion & more
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
