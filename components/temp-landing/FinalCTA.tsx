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
    <section className="relative px-4 sm:px-6 lg:px-8 py-16">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 border border-slate-700/50 px-8 py-14 text-center"
        >
          <h2 className="font-[var(--font-space-grotesk)] text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-5 leading-tight">
            Your first AI-built workflow is 60 seconds away
          </h2>
          <p className="text-lg text-slate-400 mb-8 max-w-md mx-auto">
            Describe what you want. Watch AI build it. Test it. Activate it. All free.
          </p>

          <button
            onClick={() => router.push(user ? '/workflows' : '/auth/login')}
            className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-900 text-sm font-medium h-12 px-6 rounded-lg transition-colors mb-6"
          >
            {user ? 'Go to Workflows' : 'Start building — free'}
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-xs text-slate-500">
            No credit card. Free during beta. Cancel anytime.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
