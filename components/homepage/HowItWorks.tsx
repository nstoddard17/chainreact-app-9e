"use client"

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, MousePointer, Play, CheckCircle, ArrowRight, Plus, GitBranch, Zap, Mail, FileText, Users } from 'lucide-react'

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
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    // Check for theme from document or localStorage
    const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    setTheme(currentTheme)
  }, [])

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
              <div className="h-full flex flex-col">
                {/* Integrations Page Mock Header */}
                <div className="mb-4 pb-3 border-b border-gray-200 dark:border-white/10">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Available Integrations</h3>
                </div>

                {/* Integration Cards */}
                <div className="space-y-3 flex-1 overflow-hidden">
                  {['Gmail', 'Slack', 'Notion'].map((app, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.15 }}
                      className="relative"
                    >
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-white/10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                            {app === 'Gmail' && <Mail className="w-5 h-5 text-white" />}
                            {app === 'Slack' && <Users className="w-5 h-5 text-white" />}
                            {app === 'Notion' && <FileText className="w-5 h-5 text-white" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{app}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {app === 'Gmail' && 'Send and receive emails'}
                              {app === 'Slack' && 'Team communication'}
                              {app === 'Notion' && 'Notes and databases'}
                            </p>
                          </div>
                        </div>

                        {/* Connect Button Animation */}
                        <AnimatePresence mode="wait">
                          {i === 1 ? (
                            <motion.div
                              key="connected"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              exit={{ scale: 0 }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-500/20 rounded-lg"
                            >
                              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                              <span className="text-xs font-medium text-green-700 dark:text-green-300">Connected</span>
                            </motion.div>
                          ) : (
                            <motion.button
                              key="connect"
                              initial={{ scale: 0.9 }}
                              animate={{ scale: 1 }}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                            >
                              Connect
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* OAuth popup simulation for Slack */}
                      {i === 1 && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ delay: 0.5, type: "spring" }}
                          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-3 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-white/10 z-10"
                        >
                          <p className="text-xs font-medium text-gray-900 dark:text-white mb-2">Authorize Slack</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Allow ChainReact to access your workspace</p>
                          <motion.div
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            className="w-full py-1.5 bg-green-500 text-white text-xs font-medium rounded text-center"
                          >
                            Authorizing...
                          </motion.div>
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {activeStep === 1 && (
              <div className="h-full flex flex-col">
                {/* Workflow Builder Header */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-white/10">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Workflow Builder</h3>
                  <div className="flex items-center gap-2">
                    <button className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded font-medium">
                      Save
                    </button>
                    <button className="px-2 py-1 text-xs bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300 rounded font-medium">
                      Activate
                    </button>
                  </div>
                </div>

                {/* Canvas with Grid Background */}
                <div className="flex-1 relative bg-gray-50 dark:bg-slate-800/30 rounded-lg overflow-hidden"
                     style={{
                       backgroundImage: `radial-gradient(circle, ${theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} 1px, transparent 1px)`,
                       backgroundSize: '20px 20px'
                     }}>

                  {/* Workflow Nodes */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, type: "spring" }}
                    className="absolute left-8 top-1/2 -translate-y-1/2 w-28 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg shadow-lg flex items-center justify-center"
                  >
                    <Zap className="w-4 h-4 text-white mr-1" />
                    <span className="text-xs font-medium text-white">Trigger</span>
                  </motion.div>

                  {/* Connection Line 1 */}
                  <motion.svg
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className="absolute inset-0 pointer-events-none"
                    style={{ width: '100%', height: '100%' }}
                  >
                    <motion.path
                      d="M 136 192 L 200 192"
                      stroke="url(#gradient1)"
                      strokeWidth="2"
                      fill="none"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 0.5, duration: 0.5 }}
                    />
                    <defs>
                      <linearGradient id="gradient1">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                  </motion.svg>

                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.7, type: "spring" }}
                    className="absolute left-52 top-1/2 -translate-y-1/2 w-28 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg shadow-lg flex items-center justify-center"
                  >
                    <GitBranch className="w-4 h-4 text-white mr-1" />
                    <span className="text-xs font-medium text-white">Filter</span>
                  </motion.div>

                  {/* Connection Line 2 */}
                  <motion.svg
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 1, duration: 0.5 }}
                    className="absolute inset-0 pointer-events-none"
                    style={{ width: '100%', height: '100%' }}
                  >
                    <motion.path
                      d="M 336 192 L 400 192"
                      stroke="url(#gradient2)"
                      strokeWidth="2"
                      fill="none"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 1, duration: 0.5 }}
                    />
                    <defs>
                      <linearGradient id="gradient2">
                        <stop offset="0%" stopColor="#ec4899" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                  </motion.svg>

                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.2, type: "spring" }}
                    className="absolute right-8 top-1/2 -translate-y-1/2 w-28 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg shadow-lg flex items-center justify-center"
                  >
                    <Mail className="w-4 h-4 text-white mr-1" />
                    <span className="text-xs font-medium text-white">Send Email</span>
                  </motion.div>

                  {/* Dragging Node Animation */}
                  <motion.div
                    initial={{ x: -50, y: 100, opacity: 0 }}
                    animate={{
                      x: [null, 100, 100],
                      y: [null, 100, 50],
                      opacity: [0, 1, 1]
                    }}
                    transition={{
                      delay: 1.5,
                      duration: 1.5,
                      times: [0, 0.5, 1],
                      repeat: Infinity,
                      repeatDelay: 2
                    }}
                    className="absolute w-24 h-10 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-lg shadow-lg flex items-center justify-center opacity-80"
                    style={{ left: 20, top: 20 }}
                  >
                    <Plus className="w-4 h-4 text-white mr-1" />
                    <span className="text-xs font-medium text-white">Action</span>
                  </motion.div>

                  {/* Plus Button for Adding Nodes */}
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="absolute bottom-4 right-4 w-10 h-10 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg flex items-center justify-center"
                  >
                    <Plus className="w-5 h-5 text-white" />
                  </motion.button>
                </div>
              </div>
            )}

            {activeStep === 2 && (
              <div className="h-full flex flex-col">
                {/* Dashboard Header */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-white/10">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Workflow Dashboard</h3>
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="flex items-center gap-1.5 px-2 py-1 bg-green-100 dark:bg-green-500/20 rounded"
                  >
                    <div className="w-1.5 h-1.5 bg-green-600 dark:bg-green-400 rounded-full animate-pulse" />
                    <span className="text-xs font-medium text-green-700 dark:text-green-300">Active</span>
                  </motion.div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg"
                  >
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Total Executions</p>
                    <motion.p
                      className="text-2xl font-bold text-blue-700 dark:text-blue-300"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      1,247
                    </motion.p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="p-3 bg-green-50 dark:bg-green-500/10 rounded-lg"
                  >
                    <p className="text-xs text-green-600 dark:text-green-400 mb-1">Success Rate</p>
                    <motion.p
                      className="text-2xl font-bold text-green-700 dark:text-green-300"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                    >
                      99.8%
                    </motion.p>
                  </motion.div>
                </div>

                {/* Recent Executions */}
                <div className="flex-1">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Recent Executions</p>
                  <div className="space-y-2">
                    {[
                      { status: 'success', time: '2 min ago', action: 'Email sent to client' },
                      { status: 'success', time: '5 min ago', action: 'Data synced to Notion' },
                      { status: 'running', time: 'Now', action: 'Processing webhook...' },
                    ].map((execution, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                        className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-800/50 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            execution.status === 'success'
                              ? 'bg-green-500'
                              : 'bg-yellow-500 animate-pulse'
                          }`} />
                          <span className="text-xs text-gray-700 dark:text-gray-300">{execution.action}</span>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{execution.time}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Activity Graph Simulation */}
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-white/10">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Activity</p>
                  <div className="flex items-end justify-between h-12 gap-1">
                    {[40, 65, 45, 80, 95, 70, 85, 60, 90, 75].map((height, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ delay: 0.8 + i * 0.05, type: "spring" }}
                        className="flex-1 bg-gradient-to-t from-blue-500 to-purple-500 rounded-t opacity-80"
                      />
                    ))}
                  </div>
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