"use client"

import React from 'react'
import { motion } from 'framer-motion'

// Subtle animated dot grid — slow drift
export function DotGridBg() {
  return (
    <motion.div
      animate={{ backgroundPosition: ['0px 0px', '40px 40px'] }}
      transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      className="absolute inset-0 opacity-[0.035] dark:opacity-[0.05]"
      style={{
        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }}
    />
  )
}

// Radial glow that slowly pulses
export function PulsingGlow({ color = 'orange', position = 'center' }: { color?: 'orange' | 'purple' | 'blue'; position?: 'center' | 'top-left' | 'top-right' | 'bottom' }) {
  const colors = {
    orange: 'rgba(251,146,60,0.05)',
    purple: 'rgba(148,130,240,0.04)',
    blue: 'rgba(96,165,250,0.04)',
  }
  const positions = {
    'center': '50% 50%',
    'top-left': '20% 20%',
    'top-right': '80% 20%',
    'bottom': '50% 80%',
  }

  return (
    <motion.div
      animate={{ opacity: [0.4, 1, 0.4], scale: [0.95, 1.05, 0.95] }}
      transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      className="absolute inset-0"
      style={{
        background: `radial-gradient(ellipse 60% 50% at ${positions[position]}, ${colors[color]}, transparent)`,
      }}
    />
  )
}

// Slow-moving gradient band
export function GradientShift({ direction = 'horizontal' }: { direction?: 'horizontal' | 'diagonal' }) {
  return (
    <motion.div
      animate={direction === 'horizontal'
        ? { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }
        : { backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'] }
      }
      transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      className="absolute inset-0"
      style={{
        background: direction === 'horizontal'
          ? 'linear-gradient(90deg, transparent 0%, rgba(251,146,60,0.025) 25%, transparent 50%, rgba(148,130,240,0.02) 75%, transparent 100%)'
          : 'linear-gradient(135deg, transparent 0%, rgba(251,146,60,0.03) 30%, transparent 60%, rgba(96,165,250,0.02) 80%, transparent 100%)',
        backgroundSize: '200% 200%',
      }}
    />
  )
}

// Animated connection lines — reflects workflow/AI theme
export function ConnectionLines() {
  return (
    <div className="absolute inset-0 overflow-hidden opacity-[0.04] dark:opacity-[0.06]">
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <motion.line
          x1="10%" y1="20%" x2="35%" y2="50%"
          stroke="currentColor" strokeWidth="1"
          className="text-orange-400"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 0.5, 0.5, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.line
          x1="35%" y1="50%" x2="65%" y2="30%"
          stroke="currentColor" strokeWidth="1"
          className="text-orange-400"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 0.5, 0.5, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <motion.line
          x1="65%" y1="30%" x2="90%" y2="60%"
          stroke="currentColor" strokeWidth="1"
          className="text-orange-400"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 0.5, 0.5, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        />
        {/* Node dots at endpoints */}
        <motion.circle cx="10%" cy="20%" r="3" fill="currentColor" className="text-orange-400"
          animate={{ opacity: [0.2, 0.6, 0.2], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.circle cx="35%" cy="50%" r="3" fill="currentColor" className="text-orange-400"
          animate={{ opacity: [0.2, 0.6, 0.2], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        />
        <motion.circle cx="65%" cy="30%" r="3" fill="currentColor" className="text-orange-400"
          animate={{ opacity: [0.2, 0.6, 0.2], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
        />
        <motion.circle cx="90%" cy="60%" r="3" fill="currentColor" className="text-orange-400"
          animate={{ opacity: [0.2, 0.6, 0.2], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 4.5 }}
        />
      </svg>
    </div>
  )
}

// Subtle noise/grain overlay
export function GrainOverlay() {
  return (
    <div
      className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04] pointer-events-none"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat',
        backgroundSize: '128px 128px',
      }}
    />
  )
}
