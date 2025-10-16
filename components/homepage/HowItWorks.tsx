"use client"

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, MousePointer, Play, CheckCircle, ArrowRight, Plus, GitBranch, Zap, Mail, FileText, Users, MessageSquare, Calendar, Hash, Bell, Database, Image } from 'lucide-react'

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
  const [oauthStep, setOauthStep] = useState<'initial' | 'clicking' | 'oauth' | 'authorizing' | 'connected'>('initial')

  useEffect(() => {
    // Check for theme from document or localStorage
    const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    setTheme(currentTheme)
  }, [])

  // OAuth flow animation sequence
  useEffect(() => {
    if (activeStep !== 0) {
      setOauthStep('initial')
      return
    }

    const sequence = async () => {
      await new Promise(resolve => setTimeout(resolve, 1500)) // Initial state
      setOauthStep('clicking')
      await new Promise(resolve => setTimeout(resolve, 500))
      setOauthStep('oauth')
      await new Promise(resolve => setTimeout(resolve, 2000))
      setOauthStep('authorizing')
      await new Promise(resolve => setTimeout(resolve, 1000))
      setOauthStep('connected')
      await new Promise(resolve => setTimeout(resolve, 2000))
      setOauthStep('initial')
    }

    const interval = setInterval(sequence, 7000)
    sequence() // Run immediately

    return () => clearInterval(interval)
  }, [activeStep])

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
                {/* Integrations Page Header */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-white/10">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Integrations</h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {oauthStep === 'connected' ? '1 Connected' : '0 Connected'}
                  </span>
                </div>

                {/* Integration Grid */}
                <div className="grid grid-cols-2 gap-2 flex-1">
                  {[
                    { name: 'Gmail', logo: '/integrations/gmail.svg', desc: 'Email automation' },
                    { name: 'Slack', logo: '/integrations/slack.svg', desc: 'Team communication' },
                    { name: 'Discord', logo: '/integrations/discord.svg', desc: 'Community chat' },
                    { name: 'Notion', logo: '/integrations/notion.svg', desc: 'Documentation' },
                    { name: 'Google Calendar', logo: '/integrations/google-calendar.svg', desc: 'Event scheduling' },
                    { name: 'Airtable', logo: '/integrations/airtable.svg', desc: 'Database' },
                  ].map((integration, i) => {
                    const isSlack = integration.name === 'Slack'
                    const isConnected = isSlack && oauthStep === 'connected'
                    const isClicking = isSlack && oauthStep === 'clicking'

                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`p-3 rounded-lg border transition-all ${
                          isClicking ? 'scale-95' : ''
                        } ${
                          isConnected
                            ? 'bg-green-50 dark:bg-green-500/10 border-green-300 dark:border-green-500/30'
                            : 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <img
                            src={integration.logo}
                            alt={integration.name}
                            className="w-8 h-8 object-contain"
                          />
                          <div className="flex-1">
                            <p className="text-xs font-medium text-gray-900 dark:text-white">{integration.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{integration.desc}</p>
                          </div>
                        </div>

                        {/* Connect/Connected Button */}
                        {isConnected ? (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex items-center gap-1 justify-center py-1 bg-green-100 dark:bg-green-500/20 rounded text-xs"
                          >
                            <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />
                            <span className="text-green-700 dark:text-green-300 font-medium">Connected</span>
                          </motion.div>
                        ) : (
                          <button className={`w-full py-1 text-xs font-medium rounded transition-all ${
                            isClicking
                              ? 'bg-blue-700 text-white'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}>
                            Connect
                          </button>
                        )}

                        {/* Simulated cursor for Slack */}
                        {isSlack && oauthStep === 'clicking' && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", damping: 15 }}
                            className="absolute bottom-1 right-8 pointer-events-none z-20"
                          >
                            <MousePointer className="w-5 h-5 text-gray-900 dark:text-white" />
                          </motion.div>
                        )}
                      </motion.div>
                    )
                  })}
                </div>

                {/* OAuth Window Overlay */}
                <AnimatePresence>
                  {(oauthStep === 'oauth' || oauthStep === 'authorizing') && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-20 flex items-center justify-center"
                    >
                      <motion.div
                        initial={{ scale: 0.8, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.8, y: 20 }}
                        transition={{ type: "spring", damping: 20 }}
                        className="w-64 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden"
                      >
                        {/* OAuth Header */}
                        <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1">
                              <img src="/integrations/slack.svg" alt="Slack" className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-white font-semibold text-sm">Slack Authorization</p>
                              <p className="text-white/80 text-xs">Sign in to continue</p>
                            </div>
                          </div>
                        </div>

                        {/* OAuth Body */}
                        <div className="p-4">
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                            ChainReact would like to:
                          </p>
                          <ul className="space-y-1 mb-4">
                            <li className="flex items-center gap-2">
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              <span className="text-xs text-gray-700 dark:text-gray-300">View workspace info</span>
                            </li>
                            <li className="flex items-center gap-2">
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              <span className="text-xs text-gray-700 dark:text-gray-300">Send messages</span>
                            </li>
                            <li className="flex items-center gap-2">
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              <span className="text-xs text-gray-700 dark:text-gray-300">Read channels</span>
                            </li>
                          </ul>

                          {/* Authorize Button */}
                          <motion.button
                            animate={oauthStep === 'authorizing' ? { scale: 0.95 } : { scale: 1 }}
                            className={`w-full py-2 rounded-lg text-white font-medium text-sm transition-all ${
                              oauthStep === 'authorizing'
                                ? 'bg-green-600'
                                : 'bg-purple-600 hover:bg-purple-700'
                            }`}
                          >
                            {oauthStep === 'authorizing' ? (
                              <span className="flex items-center justify-center gap-2">
                                <motion.div
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                  className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                                />
                                Authorizing...
                              </span>
                            ) : (
                              'Authorize ChainReact'
                            )}
                          </motion.button>

                          {/* Simulated cursor for clicking authorize */}
                          {oauthStep === 'oauth' && (
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ delay: 0.8, type: "spring", damping: 15 }}
                              className="absolute bottom-6 right-12 pointer-events-none z-10"
                            >
                              <MousePointer className="w-5 h-5 text-gray-900 dark:text-white" />
                            </motion.div>
                          )}
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
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