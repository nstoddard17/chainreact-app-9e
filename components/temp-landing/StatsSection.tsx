"use client"

import React from 'react'
import { motion } from 'framer-motion'

export function StatsSection() {
  return (
    <section className="relative px-4 sm:px-6 lg:px-8 py-20">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
            ChainReact connects to <span className="text-slate-900 dark:text-white font-medium">20+ tools</span> you already
            use, responds in <span className="text-slate-900 dark:text-white font-medium">under 100ms</span>, and gets
            measurably more accurate every week you use it.
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Currently in free beta. No credit card, no contracts, no sales calls.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
