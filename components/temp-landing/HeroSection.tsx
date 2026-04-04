"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { PlaceholderMedia } from './PlaceholderMedia'

export function HeroSection() {
  const router = useRouter()
  const { user } = useAuthStore()

  return (
    <section className="relative overflow-hidden">
      {/* Dark gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900" />
      {/* Subtle radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(251,146,60,0.12),transparent)]" />

      <div className="relative px-4 sm:px-6 lg:px-8 pt-24 pb-10 lg:pt-28 lg:pb-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1fr_1.15fr] gap-8 lg:gap-12 items-center">
            {/* Left: Text */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="min-w-0"
            >
              <div className="inline-flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-medium px-3 py-1.5 rounded-full mb-5">
                <Sparkles className="w-3 h-3" />
                Free AI workflow builder — no credit card required
              </div>

              <h1 className="font-[var(--font-space-grotesk)] text-[2rem] sm:text-[2.5rem] md:text-[3rem] lg:text-[3.25rem] xl:text-[3.5rem] font-bold leading-[1.1] tracking-tight text-white mb-5">
                Describe your workflow.
                <br />
                <span className="bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">Watch AI build it.</span>
              </h1>

              <p className="text-base sm:text-lg text-slate-400 leading-relaxed mb-6 max-w-[28rem]">
                Tell ChainReact what you want in plain English. AI builds it node by node, in real time — then fills in every field automatically.
              </p>

              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => router.push(user ? '/workflows' : '/auth/login')}
                  className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-900 text-sm font-medium h-11 px-5 rounded-lg transition-colors"
                >
                  {user ? 'Go to Workflows' : 'Start building — free'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    const el = document.getElementById('how-it-works')
                    if (el) el.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
                >
                  See how it works
                </button>
              </div>

              <p className="text-xs text-slate-500">
                No credit card. No configuration. Your first workflow in under 2 minutes.
              </p>
            </motion.div>

            {/* Right: Product demo */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="min-w-0 w-full"
            >
              <div className="rounded-xl border border-slate-700/50 bg-slate-900 shadow-2xl shadow-black/30 overflow-hidden">
                <PlaceholderMedia
                  label="CAPTURE: Screen-record the AI builder in action. Open /workflows/builder, type a prompt like 'When I get a Shopify order, notify Slack and log to Sheets', and record the nodes appearing on canvas. Crop to just the builder area (no browser chrome). Export as MP4 or GIF, ~60 seconds."
                  aspectRatio="16/10"
                  type="video"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}
