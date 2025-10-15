"use client"

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail,
  FileText,
  Slack,
  Database,
  Bell,
  Sparkles,
  Plus,
  MousePointer,
  Check,
  Zap,
  Calendar,
  Globe,
  MessageSquare,
  Users
} from 'lucide-react'

const nodeTypes = [
  { id: 'trigger', icon: Mail, label: 'Email Trigger', color: 'from-blue-500 to-blue-600', type: 'trigger' },
  { id: 'action1', icon: Sparkles, label: 'AI Process', color: 'from-purple-500 to-purple-600', type: 'action' },
  { id: 'action2', icon: Database, label: 'Save Data', color: 'from-green-500 to-green-600', type: 'action' },
  { id: 'action3', icon: Slack, label: 'Send to Slack', color: 'from-pink-500 to-pink-600', type: 'action' }
]

const availableNodes = [
  { icon: Mail, label: 'Email', color: 'from-blue-500 to-blue-600' },
  { icon: Calendar, label: 'Calendar', color: 'from-orange-500 to-orange-600' },
  { icon: Globe, label: 'Webhook', color: 'from-cyan-500 to-cyan-600' },
  { icon: MessageSquare, label: 'Discord', color: 'from-indigo-500 to-indigo-600' },
  { icon: Users, label: 'Teams', color: 'from-purple-500 to-purple-600' },
  { icon: FileText, label: 'Notion', color: 'from-gray-500 to-gray-600' },
]

interface WorkflowNode {
  id: string
  x: number
  y: number
  icon: any
  label: string
  color: string
  placed: boolean
}

export function WorkflowAnimation() {
  const [currentStep, setCurrentStep] = useState(0)
  const [nodes, setNodes] = useState<WorkflowNode[]>([])
  const [connections, setConnections] = useState<Array<{from: number, to: number}>>([])
  const [isPlaying, setIsPlaying] = useState(true)
  const [showPulse, setShowPulse] = useState(false)

  const steps = [
    { action: 'palette', description: 'Choose from 20+ integrations' },
    { action: 'drag', description: 'Drag Email trigger to canvas' },
    { action: 'place', description: 'Place your trigger node' },
    { action: 'connect1', description: 'Add AI processing action' },
    { action: 'connect2', description: 'Save processed data' },
    { action: 'connect3', description: 'Notify your team' },
    { action: 'flow', description: 'Watch your workflow run!' }
  ]

  useEffect(() => {
    if (!isPlaying) return

    const executeStep = () => {
      if (currentStep === 0) {
        // Show palette
        setNodes([])
        setConnections([])
        setShowPulse(false)
      } else if (currentStep === 1) {
        // Start dragging
        setNodes([{
          id: 'trigger',
          x: 100,
          y: 150,
          icon: Mail,
          label: 'Email Trigger',
          color: 'from-blue-500 to-blue-600',
          placed: false
        }])
      } else if (currentStep === 2) {
        // Place trigger
        setNodes([{
          id: 'trigger',
          x: 200,
          y: 150,
          icon: Mail,
          label: 'Email Trigger',
          color: 'from-blue-500 to-blue-600',
          placed: true
        }])
      } else if (currentStep === 3) {
        // Add AI node
        setNodes(prev => [...prev, {
          id: 'ai',
          x: 400,
          y: 150,
          icon: Sparkles,
          label: 'AI Process',
          color: 'from-purple-500 to-purple-600',
          placed: true
        }])
        setConnections([{ from: 0, to: 1 }])
      } else if (currentStep === 4) {
        // Add Database node
        setNodes(prev => [...prev, {
          id: 'db',
          x: 600,
          y: 150,
          icon: Database,
          label: 'Save Data',
          color: 'from-green-500 to-green-600',
          placed: true
        }])
        setConnections(prev => [...prev, { from: 1, to: 2 }])
      } else if (currentStep === 5) {
        // Add Slack node
        setNodes(prev => [...prev, {
          id: 'slack',
          x: 800,
          y: 150,
          icon: Slack,
          label: 'Send to Slack',
          color: 'from-pink-500 to-pink-600',
          placed: true
        }])
        setConnections(prev => [...prev, { from: 2, to: 3 }])
      } else if (currentStep === 6) {
        // Show data flow
        setShowPulse(true)
      }
    }

    executeStep()

    const timer = setTimeout(() => {
      setCurrentStep((prev) => (prev + 1) % steps.length)
    }, 2500)

    return () => clearTimeout(timer)
  }, [currentStep, isPlaying, steps.length])

  return (
    <section id="workflow-demo" className="relative z-10 px-4 sm:px-6 lg:px-8 py-20">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Build Workflows Visually
            </h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto">
              Drag, drop, and connect. No code required. Watch how easy it is to automate your work.
            </p>
          </motion.div>
        </div>

        <div className="relative bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden">
          {/* Top Bar */}
          <div className="bg-slate-800/50 px-6 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="ml-3 text-white/60 text-sm">Workflow Builder</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="px-3 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-colors text-sm"
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <div className="flex gap-1 items-center">
                {steps.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setCurrentStep(index)
                      setIsPlaying(false)
                    }}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      currentStep === index
                        ? 'w-6 bg-blue-500'
                        : 'bg-white/20 hover:bg-white/30'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Main Canvas Area */}
          <div className="flex h-96">
            {/* Sidebar Palette */}
            <motion.div
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="w-20 bg-slate-800/30 border-r border-white/10 p-3 space-y-3"
            >
              <div className="text-xs text-white/40 font-semibold mb-2 text-center">Nodes</div>
              {availableNodes.slice(0, 4).map((node, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ scale: 1.1 }}
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${node.color} p-3 cursor-pointer shadow-lg hover:shadow-xl transition-all ${
                    currentStep === 1 && i === 0 ? 'ring-2 ring-white ring-opacity-50' : ''
                  }`}
                >
                  {React.createElement(node.icon, {
                    className: 'w-full h-full text-white',
                  })}
                </motion.div>
              ))}
              <div className="pt-2 border-t border-white/10">
                <Plus className="w-8 h-8 text-white/20 mx-auto" />
              </div>
            </motion.div>

            {/* Canvas */}
            <div className="flex-1 relative p-8">
              {/* Grid Background */}
              <div className="absolute inset-0 opacity-10">
                <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
              </div>

              {/* Dragging Cursor */}
              {currentStep === 1 && (
                <motion.div
                  initial={{ x: 20, y: 20 }}
                  animate={{ x: 180, y: 130 }}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                  className="absolute z-50 pointer-events-none"
                >
                  <MousePointer className="w-6 h-6 text-white -rotate-12" />
                  <motion.div
                    className="absolute -top-12 -left-12 w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-3 shadow-2xl"
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  >
                    <Mail className="w-full h-full text-white" />
                  </motion.div>
                </motion.div>
              )}

              {/* Connections */}
              <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
                {connections.map((conn, idx) => {
                  const fromNode = nodes[conn.from]
                  const toNode = nodes[conn.to]
                  if (!fromNode || !toNode) return null

                  return (
                    <g key={idx}>
                      <motion.path
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.5 }}
                        d={`M ${fromNode.x + 60} ${fromNode.y + 30} L ${toNode.x} ${toNode.y + 30}`}
                        stroke="url(#gradient)"
                        strokeWidth="2"
                        fill="none"
                      />
                      {showPulse && (
                        <motion.circle
                          r="4"
                          fill="white"
                          animate={{
                            offsetDistance: ['0%', '100%'],
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            ease: "linear",
                            delay: idx * 0.5
                          }}
                        >
                          <animateMotion
                            dur="1.5s"
                            repeatCount="indefinite"
                            path={`M ${fromNode.x + 60} ${fromNode.y + 30} L ${toNode.x} ${toNode.y + 30}`}
                          />
                        </motion.circle>
                      )}
                    </g>
                  )
                })}
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Nodes */}
              <AnimatePresence>
                {nodes.map((node, idx) => (
                  <motion.div
                    key={node.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale: node.placed ? 1 : 0.8,
                      opacity: 1,
                      x: node.x,
                      y: node.y
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 20
                    }}
                    className="absolute"
                    style={{ zIndex: 2 }}
                  >
                    <div className={`relative w-28 h-16 rounded-xl bg-gradient-to-br ${node.color} p-3 shadow-xl ${
                      showPulse ? 'animate-pulse' : ''
                    }`}>
                      {node.placed && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.2 }}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                        >
                          <Check className="w-3 h-3 text-white" />
                        </motion.div>
                      )}
                      <div className="flex flex-col items-center justify-center h-full">
                        {React.createElement(node.icon, {
                          className: 'w-6 h-6 text-white mb-1',
                        })}
                        <span className="text-[9px] text-white/90 font-medium text-center leading-tight">
                          {node.label}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Status Bar */}
          <div className="bg-slate-800/50 px-6 py-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${showPulse ? 'bg-green-400' : 'bg-yellow-400'} animate-pulse`}></div>
                <span className="text-sm text-white/60">
                  {steps[currentStep].description}
                </span>
              </div>
              {showPulse && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20"
                >
                  <Zap className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-300 font-medium">Workflow Active</span>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12">
          {[
            { label: 'Setup Time', value: '< 2 min', desc: 'Average workflow creation' },
            { label: 'No Code', value: '100%', desc: 'Visual builder only' },
            { label: 'Templates', value: '50+', desc: 'Pre-built workflows' },
          ].map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/10 p-6 text-center"
            >
              <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-sm text-white/60 font-medium">{stat.label}</div>
              <div className="text-xs text-white/40 mt-1">{stat.desc}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}