"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'

export function AnimatedBackground() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const isDark = resolvedTheme === 'dark'

  // Define workflow node positions for 3D floating effect
  const nodes = [
    { x: '10%', y: '15%', delay: 0, logo: '/integrations/gmail.svg' },
    { x: '75%', y: '20%', delay: 1, logo: '/integrations/slack.svg' },
    { x: '25%', y: '65%', delay: 2, logo: '/integrations/notion.svg' },
    { x: '85%', y: '70%', delay: 3, logo: '/integrations/google-drive.svg' },
    { x: '50%', y: '40%', delay: 1.5, logo: '/integrations/airtable.svg' },
  ]

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Base background with subtle gradient */}
      <div className={`absolute inset-0 ${isDark ? 'bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900' : 'bg-gradient-to-br from-white via-gray-50 to-white'}`} />

      {/* Dot grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: `radial-gradient(circle, ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'} 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Animated connection lines */}
      <svg className="absolute inset-0 w-full h-full">
        {/* Line 1 */}
        <motion.path
          d="M 10% 15% Q 40% 30% 50% 40%"
          stroke={isDark ? 'rgba(147, 51, 234, 0.3)' : 'rgba(147, 51, 234, 0.2)'}
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 0], opacity: [0, 0.6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Line 2 */}
        <motion.path
          d="M 75% 20% Q 60% 30% 50% 40%"
          stroke={isDark ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)'}
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 0], opacity: [0, 0.6, 0] }}
          transition={{ duration: 6, delay: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Line 3 */}
        <motion.path
          d="M 50% 40% Q 35% 50% 25% 65%"
          stroke={isDark ? 'rgba(236, 72, 153, 0.3)' : 'rgba(236, 72, 153, 0.2)'}
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 0], opacity: [0, 0.6, 0] }}
          transition={{ duration: 6, delay: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Line 4 */}
        <motion.path
          d="M 50% 40% Q 65% 55% 85% 70%"
          stroke={isDark ? 'rgba(14, 165, 233, 0.3)' : 'rgba(14, 165, 233, 0.2)'}
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 0], opacity: [0, 0.6, 0] }}
          transition={{ duration: 6, delay: 1, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>

      {/* Floating integration nodes */}
      {nodes.map((node, index) => (
        <motion.div
          key={index}
          className={`absolute w-16 h-16 rounded-xl ${
            isDark ? 'bg-slate-800/40 border border-white/10' : 'bg-white/40 border border-gray-200/50'
          } backdrop-blur-sm shadow-2xl flex items-center justify-center`}
          style={{
            left: node.x,
            top: node.y,
          }}
          animate={{
            y: [0, -20, 0],
            x: [0, 10, 0],
            rotate: [0, 5, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 8,
            delay: node.delay,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <img
            src={node.logo}
            alt=""
            className="w-10 h-10 object-contain opacity-60"
          />
        </motion.div>
      ))}

      {/* Glowing orbs for depth */}
      <motion.div
        className="absolute w-96 h-96 rounded-full"
        style={{
          background: isDark
            ? 'radial-gradient(circle, rgba(147, 51, 234, 0.15) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(147, 51, 234, 0.1) 0%, transparent 70%)',
          left: '20%',
          top: '10%',
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      <motion.div
        className="absolute w-96 h-96 rounded-full"
        style={{
          background: isDark
            ? 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
          right: '15%',
          bottom: '15%',
        }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 12,
          delay: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />

      {/* Subtle vignette */}
      <div className={`absolute inset-0 ${isDark ? 'bg-gradient-radial from-transparent via-transparent to-slate-950' : 'bg-gradient-radial from-transparent via-transparent to-white'} opacity-60`} />
    </div>
  )
}
