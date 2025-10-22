"use client"

import React from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'

export function ChainReactLogo() {
  return (
    <div className="flex items-center gap-3">
      {/* Logo Icon */}
      <div className="relative">
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 rounded-xl opacity-10 dark:opacity-20 blur-xl"
        />
        <div className="relative w-10 h-10 flex items-center justify-center">
          <Image
            src="/logo_transparent.png"
            alt="ChainReact Logo"
            width={40}
            height={40}
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Text Logo */}
      <div className="flex items-baseline">
        <span className="text-2xl font-bold bg-gradient-to-r from-gray-900 dark:from-white to-gray-700 dark:to-white/90 bg-clip-text text-transparent">
          Chain
        </span>
        <motion.span
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-2xl font-bold bg-gradient-to-r from-blue-600 dark:from-blue-400 to-purple-600 dark:to-purple-400 bg-clip-text text-transparent"
        >
          React
        </motion.span>
      </div>
    </div>
  )
}