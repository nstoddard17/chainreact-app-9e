"use client"

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, MousePointer, Play, CheckCircle, ArrowRight } from 'lucide-react'

const steps = [
  {
    number: '01',
    title: 'Connect Your Apps',
    description: 'Link your favorite tools with secure OAuth authentication. No API keys or complex setup required.',
    icon: MousePointer,
    visual: {
      apps: ['Gmail', 'Slack', 'Notion'],
      action: 'connecting',
    },
  },
  {
    number: '02',
    title: 'Design Your Workflow',
    description: 'Drag and drop nodes to create your perfect automation. Add conditions, loops, and AI-powered actions.',
    icon: Sparkles,
    visual: {
      nodes: ['Trigger', 'Action', 'Filter', 'Output'],
      action: 'building',
    },
  },
  {
    number: '03',
    title: 'Activate & Relax',
    description: 'Turn on your workflow and let it run automatically. Monitor performance and get notifications.',
    icon: Play,
    visual: {
      status: 'Active',
      executions: '1,247',
      action: 'running',
    },
  },
]

export function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0)

  return (
    <section id="how-it-works" className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-100 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 mb-6">
              <CheckCircle className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">How It Works</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Three Steps to Automation
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Get started in minutes, not hours. Our intuitive platform makes automation accessible to everyone.
            </p>
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Steps List */}
          <div className="space-y-6">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onClick={() => setActiveStep(index)}
                className={`cursor-pointer p-6 rounded-2xl border transition-all duration-300 ${
                  activeStep === index
                    ? 'bg-blue-100 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30 shadow-xl shadow-blue-500/10'
                    : 'bg-white dark:bg-slate-900/50 border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`text-3xl font-bold ${
                    activeStep === index ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-white/20'
                  }`}>
                    {step.number}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      {step.title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      {step.description}
                    </p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                    activeStep === index
                      ? 'bg-gradient-to-br from-blue-500 to-purple-500'
                      : 'bg-gray-100 dark:bg-white/5'
                  }`}>
                    {React.createElement(step.icon, {
                      className: `w-5 h-5 ${activeStep === index ? 'text-white' : 'text-gray-600 dark:text-white/40'}`,
                    })}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Visual Display */}
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="relative h-96 bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-white/10 p-8 overflow-hidden"
          >
            {activeStep === 0 && (
              <div className="h-full flex flex-col items-center justify-center">
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {steps[0].visual.apps.map((app, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-semibold shadow-xl"
                    >
                      {app}
                    </motion.div>
                  ))}
                </div>
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500/20 rounded-full"
                >
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="text-green-700 dark:text-green-300 font-medium">Connected Successfully</span>
                </motion.div>
              </div>
            )}

            {activeStep === 1 && (
              <div className="h-full flex items-center justify-center">
                <div className="relative">
                  {steps[1].visual.nodes.map((node, i) => (
                    <motion.div
                      key={i}
                      initial={{ x: -100, opacity: 0 }}
                      animate={{ x: i * 120 - 180, opacity: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className="absolute top-1/2 -translate-y-1/2 w-24 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white text-sm font-medium shadow-xl"
                      style={{ left: '50%' }}
                    >
                      {node}
                    </motion.div>
                  ))}
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={`line-${i}`}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                      className="absolute top-1/2 -translate-y-1/2 w-24 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500"
                      style={{ left: `calc(50% + ${i * 120 - 120}px)` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {activeStep === 2 && (
              <div className="h-full flex flex-col items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                  className="w-32 h-32 rounded-full border-4 border-green-500/20 border-t-green-500 mb-8"
                />
                <div className="text-center">
                  <div className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                    {steps[2].visual.executions}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">Workflows Executed</div>
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="inline-flex items-center gap-2 mt-4 px-3 py-1 bg-green-500/20 rounded-full"
                  >
                    <div className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full animate-pulse" />
                    <span className="text-green-700 dark:text-green-300 text-sm font-medium">
                      {steps[2].visual.status}
                    </span>
                  </motion.div>
                </div>
              </div>
            )}
          </motion.div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center mt-16"
        >
          <button className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-2xl shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-300 transform hover:scale-105 group">
            Start Automating Now
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>
      </div>
    </section>
  )
}