"use client"

import React, { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import {
  Mail,
  Sparkles,
  Database,
  Bell,
  Globe,
  Zap,
  MessageSquare,
  FileText,
  Users,
  Calendar,
  Shield,
  Activity
} from 'lucide-react'

interface Node {
  id: string
  x: number
  y: number
  icon: any
  label: string
  color: string
  delay: number
}

interface Connection {
  from: string
  to: string
  delay: number
}

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

const nodes: Node[] = [
  { id: 'trigger', x: 150, y: 200, icon: Mail, label: 'New Email', color: 'from-blue-500 to-cyan-500', delay: 0.5 },
  { id: 'ai', x: 400, y: 150, icon: Sparkles, label: 'AI Analysis', color: 'from-purple-500 to-pink-500', delay: 1 },
  { id: 'condition', x: 400, y: 250, icon: Shield, label: 'Filter Spam', color: 'from-orange-500 to-red-500', delay: 1.2 },
  { id: 'database', x: 650, y: 100, icon: Database, label: 'Store Data', color: 'from-green-500 to-emerald-500', delay: 1.5 },
  { id: 'slack', x: 650, y: 200, icon: MessageSquare, label: 'Slack Alert', color: 'from-indigo-500 to-purple-500', delay: 1.7 },
  { id: 'webhook', x: 650, y: 300, icon: Globe, label: 'Webhook', color: 'from-cyan-500 to-blue-500', delay: 1.9 },
  { id: 'complete', x: 900, y: 200, icon: Activity, label: 'Complete', color: 'from-green-500 to-teal-500', delay: 2.2 }
]

const connections: Connection[] = [
  { from: 'trigger', to: 'ai', delay: 0.8 },
  { from: 'trigger', to: 'condition', delay: 1 },
  { from: 'ai', to: 'database', delay: 1.3 },
  { from: 'ai', to: 'slack', delay: 1.5 },
  { from: 'condition', to: 'webhook', delay: 1.7 },
  { from: 'database', to: 'complete', delay: 2 },
  { from: 'slack', to: 'complete', delay: 2.1 },
  { from: 'webhook', to: 'complete', delay: 2.2 }
]

export function WorkflowAnimation() {
  const [isVisible, setIsVisible] = useState(false)
  const [particles, setParticles] = useState<Particle[]>([])
  const [activeConnections, setActiveConnections] = useState<string[]>([])
  const [showDataFlow, setShowDataFlow] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>()

  useEffect(() => {
    const updateViewportFlag = () => {
      setIsDesktop(window.innerWidth >= 768)
    }
    updateViewportFlag()
    window.addEventListener('resize', updateViewportFlag)
    return () => window.removeEventListener('resize', updateViewportFlag)
  }, [])

  // Generate particles
  useEffect(() => {
    if (!isDesktop) {
      setParticles([])
      return
    }

    const interval = setInterval(() => {
      if (isVisible) {
        setParticles(prev => {
          const newParticles = [...prev]
          // Add new particles
          for (let i = 0; i < 2; i++) {
            newParticles.push({
              id: Date.now() + i,
              x: Math.random() * (canvasRef.current?.width || 1000),
              y: Math.random() * (canvasRef.current?.height || 400),
              vx: (Math.random() - 0.5) * 0.5,
              vy: (Math.random() - 0.5) * 0.5,
              life: 100
            })
          }
          // Update and filter particles
          return newParticles
            .map(p => ({
              ...p,
              x: p.x + p.vx,
              y: p.y + p.vy,
              life: p.life - 1
            }))
            .filter(p => p.life > 0)
            .slice(-50) // Keep max 50 particles
        })
      }
    }, 100)

    return () => clearInterval(interval)
  }, [isVisible, isDesktop])

  // Animation sequence
  useEffect(() => {
    if (!isVisible || !isDesktop) return

    // Reset state
    setActiveConnections([])
    setShowDataFlow(false)

    // Animate connections
    connections.forEach((conn) => {
      setTimeout(() => {
        setActiveConnections(prev => [...prev, `${conn.from}-${conn.to}`])
      }, conn.delay * 1000)
    })

    // Show data flow
    setTimeout(() => {
      setShowDataFlow(true)
    }, 2500)

    // Reset animation
    const resetTimer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(() => setIsVisible(true), 100)
    }, 8000)

    return () => clearTimeout(resetTimer)
  }, [isVisible, isDesktop])

  // Observer for viewport visibility
  useEffect(() => {
    if (!isDesktop) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true)
        }
      },
      { threshold: 0.3 }
    )

    const element = document.getElementById('workflow-animation')
    if (element) observer.observe(element)

    return () => {
      if (element) observer.unobserve(element)
    }
  }, [isVisible, isDesktop])

  // Draw particles on canvas
  useEffect(() => {
    if (!isDesktop) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw particles
      particles.forEach(particle => {
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, 1, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(147, 197, 253, ${particle.life / 100})`
        ctx.fill()
      })

      animationFrameRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [particles])

  const getPath = (from: Node, to: Node) => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const mx = from.x + dx / 2
    const my = from.y + dy / 2

    // Create a curved path
    return `M ${from.x + 50} ${from.y} Q ${mx} ${my - 30} ${to.x - 50} ${to.y}`
  }

  return (
    <section id="workflow-animation" className="relative z-10 px-4 sm:px-6 lg:px-8 py-20 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-100 dark:from-blue-500/10 to-purple-100 dark:to-purple-500/10 border border-blue-200 dark:border-blue-500/20 mb-6">
              <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Intelligent Automation</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Watch Your Workflows Come to Life
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Complex automations built in seconds. See how ChainReact orchestrates multiple services seamlessly.
            </p>
          </motion.div>
        </div>

        <div className="relative">
          {/* Mobile-friendly workflow summary */}
          {!isDesktop && (
            <div className="md:hidden grid gap-4 sm:grid-cols-2">
              {nodes.map((node) => (
                <motion.div
                  key={node.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4 }}
                  className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/60 backdrop-blur-xl p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${node.color} flex items-center justify-center text-white`}>
                      {React.createElement(node.icon, { className: 'w-5 h-5' })}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{node.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {node.id === 'trigger' && 'Automatically capture new events'}
                        {node.id === 'ai' && 'AI understands the context instantly'}
                        {node.id === 'condition' && 'Smart filters keep noise out'}
                        {node.id === 'database' && 'Store structured insights securely'}
                        {node.id === 'slack' && 'Notify teams where they already work'}
                        {node.id === 'webhook' && 'Push updates to any destination'}
                        {node.id === 'complete' && 'Track the entire automation lifecycle'}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Main container with glassmorphism */}
          <div className={`relative bg-white/80 dark:bg-slate-900/30 backdrop-blur-2xl rounded-3xl border border-gray-200 dark:border-white/10 p-6 sm:p-8 overflow-hidden ${isDesktop ? '' : 'hidden md:block'}`}>
            {/* Glow effects */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500 rounded-full filter blur-[128px] opacity-20 animate-pulse"></div>
              <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500 rounded-full filter blur-[128px] opacity-20 animate-pulse [animation-delay:1s]"></div>
            </div>

            {/* Canvas for particles */}
            <canvas
              ref={canvasRef}
              width={1000}
              height={400}
              className="absolute inset-0 pointer-events-none"
            />

            {/* SVG for connections */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width="100%"
              height="400"
              style={{ zIndex: 1 }}
            >
              <defs>
                <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                  <stop offset="50%" stopColor="#a855f7" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#ec4899" stopOpacity="0.2" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              {/* Draw connections */}
              {connections.map((conn) => {
                const from = nodes.find(n => n.id === conn.from)
                const to = nodes.find(n => n.id === conn.to)
                if (!from || !to) return null

                const isActive = activeConnections.includes(`${conn.from}-${conn.to}`)

                return (
                  <g key={`${conn.from}-${conn.to}`}>
                    {/* Connection line */}
                    <motion.path
                      d={getPath(from, to)}
                      stroke="url(#connectionGradient)"
                      strokeWidth="2"
                      fill="none"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={isActive ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                      transition={{ duration: 0.5, ease: "easeInOut" }}
                      filter="url(#glow)"
                    />

                    {/* Data flow particles */}
                    {showDataFlow && isActive && (
                      <circle
                        r="3"
                        fill="#fff"
                        filter="url(#glow)"
                      >
                        <animateMotion
                          dur="2s"
                          repeatCount="indefinite"
                          path={getPath(from, to)}
                        />
                      </circle>
                    )}
                  </g>
                )
              })}
            </svg>

            {/* Nodes */}
            <div className="relative" style={{ height: '400px', zIndex: 2 }}>
              {nodes.map((node) => (
                <motion.div
                  key={node.id}
                  className="absolute"
                  style={{ left: node.x - 50, top: node.y - 32 }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={isVisible ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                  transition={{
                    duration: 0.5,
                    delay: node.delay,
                    type: "spring",
                    stiffness: 200,
                    damping: 20
                  }}
                >
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className="relative"
                  >
                    {/* Node glow effect */}
                    <motion.div
                      className={`absolute inset-0 bg-gradient-to-br ${node.color} rounded-2xl blur-xl`}
                      animate={{
                        opacity: showDataFlow ? [0.3, 0.6, 0.3] : 0.3
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    />

                    {/* Node content */}
                    <div className={`relative bg-gradient-to-br ${node.color} rounded-2xl p-4 shadow-2xl border border-white/10`}>
                      <div className="flex flex-col items-center gap-2">
                        {React.createElement(node.icon, {
                          className: 'w-6 h-6 text-white'
                        })}
                        <span className="text-xs text-white font-semibold whitespace-nowrap">
                          {node.label}
                        </span>
                      </div>

                      {/* Success indicator */}
                      {showDataFlow && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: node.delay + 2 }}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                        >
                          <Zap className="w-3 h-3 text-white" />
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              ))}
            </div>

            {/* Status indicator */}
            <div className="absolute bottom-4 left-4 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${showDataFlow ? 'bg-green-500 dark:bg-green-400' : 'bg-yellow-500 dark:bg-yellow-400'} animate-pulse`}></div>
              <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                {showDataFlow ? 'Workflow running...' : 'Building workflow...'}
              </span>
            </div>

            {/* Execution counter */}
            {showDataFlow && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 3 }}
                className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-full border border-green-500/20"
              >
                <Activity className="w-4 h-4 text-green-400" />
                <span className="text-xs text-green-300 font-medium">
                  247 executions today
                </span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12">
          {[
            { icon: Zap, label: 'Lightning Fast', desc: 'Execute in milliseconds' },
            { icon: Shield, label: 'Reliable', desc: '99.9% uptime guaranteed' },
            { icon: Globe, label: 'Scalable', desc: 'From 1 to 1M+ events' }
          ].map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-white dark:bg-slate-800/40 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-white/20 p-6 text-center hover:shadow-lg dark:hover:bg-slate-800/60 transition-all"
            >
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-500 dark:to-purple-500 p-2.5 border border-blue-200 dark:border-transparent">
                <div className="w-full h-full rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 p-1.5 flex items-center justify-center">
                  {React.createElement(feature.icon, {
                    className: 'w-full h-full text-white'
                  })}
                </div>
              </div>
              <div className="text-gray-900 dark:text-white font-bold mb-1">{feature.label}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{feature.desc}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
