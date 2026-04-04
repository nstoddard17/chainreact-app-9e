"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { PlaceholderMedia } from './PlaceholderMedia'

export function HeroSection() {
  const router = useRouter()
  const { user } = useAuthStore()

  return (
    <section className="relative px-4 sm:px-6 lg:px-8 pt-28 pb-12 lg:pt-32 lg:pb-20">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-14 items-center">
          {/* Left: Text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0"
          >
            <p className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-5 tracking-wide">
              Free during beta
            </p>

            <h1 className="font-[var(--font-space-grotesk)] text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.25rem] xl:text-[3.5rem] font-bold leading-[1.1] tracking-tight text-slate-900 dark:text-white mb-6">
              Your automations break.
              <br />
              <span className="text-orange-500">Ours learn.</span>
            </h1>

            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-8 max-w-[28rem]">
              ChainReact builds workflows that get better every time you correct them. AI makes a mistake, you fix it once, and it never makes that mistake again.
            </p>

            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={() => router.push(user ? '/workflows' : '/auth/login')}
                className="inline-flex items-center gap-2 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium h-11 px-5 rounded-lg transition-colors"
              >
                {user ? 'Go to Workflows' : 'Start building — free'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  const el = document.getElementById('how-it-works')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                See how it works
              </button>
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500">
              No credit card required. Set up in under 5 minutes.
            </p>
          </motion.div>

          {/* Right: Product screenshot */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0 w-full"
          >
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/50 bg-white dark:bg-slate-900 shadow-2xl shadow-slate-900/8 dark:shadow-black/20 overflow-hidden">
              {/* Browser chrome */}
              <div className="flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 px-3 py-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
                <div className="ml-3 flex-1 rounded-md border border-slate-200 dark:border-slate-600 bg-white/80 dark:bg-slate-700/50 px-3 py-0.5 text-center text-[11px] text-slate-400 dark:text-slate-500">
                  app.chainreact.ai
                </div>
              </div>
              <PlaceholderMedia
                label="Screenshot: Workflow Builder — full canvas with nodes and connections"
                aspectRatio="16/10"
                type="screenshot"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
