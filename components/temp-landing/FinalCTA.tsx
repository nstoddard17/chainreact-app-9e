"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'

export function FinalCTA() {
  const router = useRouter()
  const { user } = useAuthStore()

  return (
    <section className="relative px-4 sm:px-6 lg:px-8 py-24">
      <div className="max-w-2xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-[var(--font-space-grotesk)] text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-5 leading-tight">
            Try it. It's free.
          </h2>
          <p className="text-lg text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto">
            Set up your first workflow in under 5 minutes.
            No credit card. No sales call.
          </p>

          <button
            onClick={() => router.push(user ? '/workflows' : '/auth/login')}
            className="inline-flex items-center gap-2 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium h-12 px-6 rounded-lg transition-colors mb-6"
          >
            {user ? 'Go to Workflows' : 'Start building — free'}
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            Join the beta. Cancel anytime.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
