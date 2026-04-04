"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { X, Check } from 'lucide-react'

const comparisons = [
  {
    other: 'You configure every field manually',
    chainreact: 'AI fills in fields automatically',
  },
  {
    other: 'You debug when things break',
    chainreact: 'AI explains what went wrong and fixes it',
  },
  {
    other: 'You build logic from scratch',
    chainreact: 'Describe what you need in plain English',
  },
  {
    other: 'You maintain workflows forever',
    chainreact: 'Workflows improve themselves over time',
  },
]

export function WhyAutomationBreaks() {
  return (
    <section className="relative px-4 sm:px-6 lg:px-8 py-16">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <h2 className="font-[var(--font-space-grotesk)] text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white leading-tight mb-4">
            Other tools make you do all the work.
          </h2>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Zapier and Make expect you to figure out the logic, configure every field, and debug every failure yourself.
            Most people just want to <span className="text-slate-900 dark:text-white font-medium">describe what they need and have it work</span>.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white dark:bg-slate-900/40 shadow-sm p-4">
          {/* Other tools column */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-xl bg-slate-50/80 dark:bg-slate-800/30 p-5"
          >
            <h3 className="font-[var(--font-space-grotesk)] text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-5">
              Other tools
            </h3>
            <div className="space-y-4">
              {comparisons.map((item, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <X className="w-3 h-3 text-red-500" />
                  </div>
                  <span className="text-sm text-slate-500 dark:text-slate-400">{item.other}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ChainReact column */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="rounded-xl bg-orange-50/40 dark:bg-orange-500/5 p-5"
          >
            <h3 className="font-[var(--font-space-grotesk)] text-sm font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-5">
              ChainReact
            </h3>
            <div className="space-y-4">
              {comparisons.map((item, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-sm text-slate-700 dark:text-slate-300">{item.chainreact}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
