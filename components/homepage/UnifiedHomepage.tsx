"use client"

import React from 'react'
import { useTheme } from 'next-themes'
import { ThemeToggle } from './ThemeToggle'
import { HeroSection } from './HeroSection'
import { WorkflowAnimation } from './WorkflowAnimation'
import { FeaturesGrid } from './FeaturesGrid'
import { IntegrationsShowcase } from './IntegrationsShowcase'
import { HowItWorks } from './HowItWorks'
import { Footer } from './Footer'
import { ChainReactLogo } from './ChainReactLogo'

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
    <div className={`min-h-screen overflow-x-hidden transition-colors duration-500 ${
      isDark ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950' : 'bg-gradient-to-br from-white via-blue-50 to-purple-50'
    }`}>
      {/* Theme Toggle Button */}
      <ThemeToggle />

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
      <nav className={`relative z-40 px-4 sm:px-6 lg:px-8 py-6 backdrop-blur-lg border-b transition-colors duration-500 ${
        isDark
          ? 'bg-slate-900/50 border-white/10'
          : 'bg-white/90 border-gray-200 shadow-sm'
      }`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <ChainReactLogo />
          <div className="flex items-center gap-6">
            <a href="#features" className={`font-semibold transition-colors ${
              isDark ? 'text-white/80 hover:text-white' : 'text-gray-700 hover:text-blue-600'
            }`}>
              Features
            </a>
            <a href="#integrations" className={`font-semibold transition-colors ${
              isDark ? 'text-white/80 hover:text-white' : 'text-gray-700 hover:text-blue-600'
            }`}>
              Integrations
            </a>
            <a href="#how-it-works" className={`font-semibold transition-colors ${
              isDark ? 'text-white/80 hover:text-white' : 'text-gray-700 hover:text-blue-600'
            }`}>
              How it Works
            </a>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <HeroSection />
      <WorkflowAnimation />
      <FeaturesGrid />
      <IntegrationsShowcase />
      <HowItWorks />
      <Footer />
    </div>
  )
}