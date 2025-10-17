"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles, Zap, Play } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function NewHeroSection() {
  const router = useRouter()
  const [isDemoHovered, setIsDemoHovered] = React.useState(false)

  return (
    <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32 bg-transparent">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 mb-8"
            >
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                AI-Powered Workflow Automation
              </span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 text-neutral-900 dark:text-white"
            >
              Automate Your Work
              <br />
              <span className="text-blue-600 dark:text-blue-400">
                Like Magic
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-xl text-neutral-600 dark:text-neutral-400 max-w-3xl mx-auto mb-10"
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
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg font-semibold rounded-xl shadow-2xl shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 transform hover:scale-105 group"
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
                className="border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5 px-8 py-6 text-lg rounded-xl cursor-not-allowed transition-all"
              >
                <Play className="w-5 h-5 mr-2" />
                Watch Demo
                <span className={`ml-2 transition-all ${isDemoHovered ? 'text-neutral-600 dark:text-neutral-300' : 'text-neutral-400 dark:text-neutral-500'}`}>
                  {isDemoHovered ? 'Coming Soon' : '2 min'}
                </span>
              </Button>
            </motion.div>

            {/* Social Proof */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-8 text-neutral-600 dark:text-neutral-400"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                <span className="text-sm">
                  <strong className="text-neutral-900 dark:text-white">Join</strong> early access
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-sm">
                  <strong className="text-neutral-900 dark:text-white">20+</strong> integrations ready
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
                <span className="text-sm">
                  <strong className="text-neutral-900 dark:text-white">10x</strong> faster workflows
                </span>
              </div>
            </motion.div>
          </div>
        </div>
    </section>
  )
}
