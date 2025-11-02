"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowRight, Brain, Workflow, Zap, FileText, Eye, Code } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function NewHeroSection() {
  const router = useRouter()

  return (
    <section className="relative px-4 sm:px-6 lg:px-8 pt-32 pb-24 lg:pt-40 lg:pb-32">
      <div className="max-w-7xl mx-auto">
        <div className="text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 mb-6"
          >
            <Brain className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
              Intelligent Workflow Automation
            </span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 text-gray-900 dark:text-white leading-tight tracking-tight"
          >
            Workflow automation
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
              that thinks for itself
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed"
          >
            Build intelligent workflows with AI that remembers your context, reads your documents,
            and makes smart decisions—all without writing code.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-16"
          >
            <Button
              size="lg"
              onClick={() => router.push('/waitlist')}
              className="bg-white hover:bg-gray-50 dark:bg-white dark:hover:bg-gray-50 text-gray-900 dark:text-white hover:text-gray-900 dark:hover:text-gray-900 border border-gray-200 dark:border-gray-200 px-6 py-3 rounded-lg font-medium transition-colors shadow-sm"
            >
              Start Building
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
              <Eye className="w-4 h-4 mr-2" />
              See it in action
            </Button>
          </motion.div>

          {/* Key Capabilities - Clean grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto"
          >
            <div className="text-center">
              <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                <Code className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                No Code Required
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Visual drag-and-drop builder
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                AI with Memory
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Reads your docs and remembers context
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 rounded-lg bg-pink-100 dark:bg-pink-500/10 flex items-center justify-center mx-auto mb-4">
                <Workflow className="w-6 h-6 text-pink-600 dark:text-pink-400" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Deep Integrations
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Gmail, Slack, HubSpot, Notion & 20+ more
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
