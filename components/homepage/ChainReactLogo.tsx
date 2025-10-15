"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'

export function ChainReactLogo() {
  return (
    <div className="flex items-center gap-3">
      {/* Animated Logo Icon */}
      <div className="relative">
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl opacity-20 blur-xl"
        />
        <div className="relative w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-6 h-6"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Chain Link Icon */}
            <path
              d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Lightning bolt overlay for "React" */}
            <motion.path
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              d="M13 2L7 14h4l-1 8 6-12h-4l1-8z"
              fill="white"
              opacity="0.6"
            />
          </svg>
        </div>
      </div>

      {/* Text Logo */}
      <div className="flex items-baseline">
        <span className="text-2xl font-bold bg-gradient-to-r from-white to-white/90 bg-clip-text text-transparent">
          Chain
        </span>
        <motion.span
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
        >
          React
        </motion.span>
      </div>
    </div>
  )
}