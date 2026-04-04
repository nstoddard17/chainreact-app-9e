"use client"

import React from 'react'
import { motion } from 'framer-motion'

const stats = [
  { value: '247+', label: 'Workflow nodes' },
  { value: '35+', label: 'Deep integrations' },
  { value: '< 100ms', label: 'Avg response time' },
  { value: '60 sec', label: 'AI builds a workflow' },
]

export function StatsSection() {
  return (
    <section className="relative px-4 sm:px-6 lg:px-8 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className="text-center rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900/40 shadow-sm py-8 px-4"
            >
              <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-orange-500 to-rose-500 bg-clip-text text-transparent mb-2">
                {stat.value}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
        <p className="text-center text-sm text-slate-400 dark:text-slate-500 mt-6">
          Currently in free beta. No credit card, no contracts, no sales calls.
        </p>
      </div>
    </section>
  )
}
