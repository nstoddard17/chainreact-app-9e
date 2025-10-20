"use client"

import React from 'react'
import { useTheme } from 'next-themes'
import { HeroSection } from './HeroSection'
import { WorkflowAnimation } from './WorkflowAnimation'
import { FeaturesGrid } from './FeaturesGrid'
import { IntegrationsShowcase } from './IntegrationsShowcase'
import { Footer } from './Footer'
import { HomepageHeader } from '@/components/layout/HomepageHeader'
import { HowItWorks } from './HowItWorks'
import Link from 'next/link'

export function UnifiedHomepage() {
  const { theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  const isDark = theme === 'dark'

  return (
    <div className={`min-h-screen transition-colors duration-500 overflow-x-hidden ${
      isDark ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950' : 'bg-gradient-to-br from-white via-blue-50 to-purple-50'
    }`}>

      {/* Animated background particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-0 left-1/4 w-96 h-96 rounded-full filter blur-3xl animate-pulse ${
          isDark ? 'bg-blue-500 opacity-10' : 'bg-blue-200 opacity-20'
        }`}></div>
        <div className={`absolute top-0 right-1/4 w-96 h-96 rounded-full filter blur-3xl animate-pulse [animation-delay:2s] ${
          isDark ? 'bg-purple-500 opacity-10' : 'bg-purple-200 opacity-20'
        }`}></div>
        <div className={`absolute bottom-0 left-1/2 w-96 h-96 rounded-full filter blur-3xl animate-pulse [animation-delay:4s] ${
          isDark ? 'bg-pink-500 opacity-10' : 'bg-pink-200 opacity-20'
        }`}></div>
      </div>

      {/* Navigation */}
      <HomepageHeader />

      {/* Main Content */}
      <HeroSection />
      <div className="-mt-6 sm:-mt-10 relative z-10">
        <HowItWorks />
      </div>
      <WorkflowAnimation />
      <FeaturesGrid />
      <IntegrationsShowcase />
      <section className="relative z-10 px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl border border-white/60 dark:border-white/10 bg-white/90 dark:bg-slate-950/70 backdrop-blur-xl px-8 py-12 sm:px-12 shadow-2xl shadow-purple-500/10">
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-500/15 via-purple-500/10 to-pink-500/10" aria-hidden />
            <div className="relative flex flex-col items-center gap-4 text-center sm:gap-5">
              <h3 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
                Ready to automate your workflow?
              </h3>
              <p className="mt-1 text-sm sm:text-base text-gray-600 dark:text-gray-300 max-w-none lg:whitespace-nowrap">
                <Link
                  href="/waitlist"
                  className="text-blue-600 dark:text-blue-300 underline underline-offset-4 decoration-blue-400/70 hover:text-blue-700 dark:hover:text-blue-200 transition-colors"
                >
                  Join the ChainReact waitlist
                </Link>{' '}
                to get early access to AI-powered automation tailored to your stack.
              </p>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}
