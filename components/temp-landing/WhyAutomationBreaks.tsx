"use client"

import React from 'react'
import { motion } from 'framer-motion'

export function WhyAutomationBreaks() {
  return (
    <section className="relative px-4 sm:px-6 lg:px-8 py-24">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-[var(--font-space-grotesk)] text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white leading-tight mb-8">
            Every automation tool has the same problem.
          </h2>

          <div className="space-y-6 text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
            <p>
              You spend hours setting up a workflow. It works perfectly — until it doesn't.
              An edge case appears. The AI misclassifies something. You fix it manually.
              Then it happens again next week.
            </p>
            <p>
              The frustrating part? <span className="text-slate-900 dark:text-white font-medium">Your fix disappears.</span> The
              system doesn't remember. It doesn't learn. You're stuck in a loop of
              building, breaking, and rebuilding the same automation.
            </p>
            <p className="text-slate-900 dark:text-white font-medium">
              We built ChainReact because we think that's backwards.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
