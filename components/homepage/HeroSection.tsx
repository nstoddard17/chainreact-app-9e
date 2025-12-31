"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles, Zap, Play, MousePointer, GitBranch } from 'lucide-react'
import { useRouter } from 'next/navigation'

const heroSteps = [
  {
    number: '01',
    title: 'Connect Your Apps',
    description: 'Use secure OAuth to plug in Slack, Gmail, Notion, HubSpot, and more—no API keys required.',
    icon: MousePointer,
  },
  {
    number: '02',
    title: 'Design Your Workflow',
    description: 'Drag, drop, and layer AI-powered logic to automate even the most advanced processes.',
    icon: GitBranch,
  },
  {
    number: '03',
    title: 'Launch & Relax',
    description: 'Flip the switch and let ChainReact run 24/7 while you monitor results from one dashboard.',
    icon: Zap,
  },
]

export function HeroSection() {
  const router = useRouter()
  const [isDemoHovered, setIsDemoHovered] = React.useState(false)

  return (
    <section id="overview" className="relative z-10 px-4 sm:px-6 lg:px-8 pt-20 pb-24 lg:pt-28 lg:pb-32">
      <div className="absolute inset-x-0 -top-32 h-80 bg-gradient-to-br from-orange-500/10 via-rose-500/10 to-transparent blur-3xl pointer-events-none" aria-hidden />
      <div className="max-w-7xl mx-auto">
        <div className="relative text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-100 dark:from-orange-500/10 to-rose-100 dark:to-rose-500/10 border border-orange-200 dark:border-orange-500/20 mb-8"
          >
            <Sparkles className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">
              AI-Powered Workflow Automation
            </span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 text-gray-900 dark:text-white"
          >
            Automate Your Work
            <br />
            <span className="bg-gradient-to-r from-orange-500 dark:from-orange-400 via-rose-500 dark:via-rose-400 to-pink-500 dark:to-pink-400 bg-clip-text text-transparent">
              Like Magic
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-10"
          >
            Connect your favorite apps, design powerful workflows visually, and let AI handle the rest.
            No coding required. Just drag, drop, and watch your productivity soar.
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
              className="bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white px-8 py-6 text-lg font-semibold rounded-xl shadow-2xl shadow-orange-500/25 hover:shadow-orange-500/40 transition-all duration-300 transform hover:scale-105 group"
            >
              <Zap className="w-5 h-5 mr-2" />
              Join the Waitlist
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onMouseEnter={() => setIsDemoHovered(true)}
              onMouseLeave={() => setIsDemoHovered(false)}
              className="border-gray-300 dark:border-white/20 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 px-8 py-6 text-lg rounded-xl cursor-not-allowed transition-all"
            >
              <Play className="w-5 h-5 mr-2" />
              Watch Demo
              <span className={`ml-2 transition-all ${isDemoHovered ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                {isDemoHovered ? 'Coming Soon' : '2 min'}
              </span>
            </Button>
          </motion.div>

          {/* Social Proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-8 text-gray-600 dark:text-gray-300"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500 dark:text-orange-400" />
              <span className="text-sm">
                <strong className="text-gray-900 dark:text-white">Join</strong> early access
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm">
                <strong className="text-gray-900 dark:text-white">20+</strong> integrations ready
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span className="text-sm">
                <strong className="text-gray-900 dark:text-white">10x</strong> faster workflows
              </span>
            </div>
          </motion.div>

          {/* Three steps highlight */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="relative mt-16"
          >
            <div className="absolute inset-x-0 -top-6 -bottom-6 rounded-[48px] bg-gradient-to-r from-orange-500/15 via-rose-500/10 to-pink-500/10 blur-3xl opacity-70 dark:opacity-60 pointer-events-none" aria-hidden />
            <div className="relative grid gap-6 md:grid-cols-3">
              {heroSteps.map((step, index) => (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.35 + index * 0.08 }}
                  className="group relative overflow-hidden rounded-3xl border border-orange-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur-xl p-6 text-left shadow-xl shadow-orange-500/5"
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-10 bg-gradient-to-br from-orange-500 via-rose-500 to-pink-500 transition-opacity" aria-hidden />
                  <div className="flex items-start gap-4 relative">
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-600/80 dark:text-orange-300/70">Step</span>
                      <span className="text-2xl font-bold text-orange-600 dark:text-orange-300">{step.number}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-300">
                          <step.icon className="w-5 h-5" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {step.title}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
