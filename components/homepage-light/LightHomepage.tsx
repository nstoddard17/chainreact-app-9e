"use client"

import React, { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { LightHeroSection } from './LightHeroSection'
import { LightWorkflowAnimation } from './LightWorkflowAnimation'
import { LightFeaturesGrid } from './LightFeaturesGrid'
import { LightIntegrationsShowcase } from './LightIntegrationsShowcase'
import { LightHowItWorks } from './LightHowItWorks'
import { LightFooter } from './LightFooter'
import { LightChainReactLogo } from './LightChainReactLogo'

export function LightHomepage() {
  const { setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    // Set light mode for this page
    setTheme('light')

    // Cleanup: don't change theme when unmounting
    return () => {
      // Don't restore previous theme - let user's choice persist
    }
  }, [mounted, setTheme])

  // Don't render until mounted to avoid flash
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      {/* Animated background particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 1 }}>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-200 rounded-full filter blur-3xl opacity-10 animate-pulse"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-200 rounded-full filter blur-3xl opacity-10 animate-pulse [animation-delay:2s]"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-200 rounded-full filter blur-3xl opacity-10 animate-pulse [animation-delay:4s]"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-50 px-4 sm:px-6 lg:px-8 py-6 bg-white/90 backdrop-blur-lg border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <LightChainReactLogo />
          <div className="flex items-center gap-6">
            <a href="#features" className="text-gray-700 hover:text-blue-600 transition-colors font-semibold">
              Features
            </a>
            <a href="#integrations" className="text-gray-700 hover:text-blue-600 transition-colors font-semibold">
              Integrations
            </a>
            <a href="#how-it-works" className="text-gray-700 hover:text-blue-600 transition-colors font-semibold">
              How it Works
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section with Workflow Animation */}
      <LightHeroSection />

      {/* Interactive Workflow Animation */}
      <LightWorkflowAnimation />

      {/* Features Grid */}
      <LightFeaturesGrid />

      {/* Integrations Showcase */}
      <LightIntegrationsShowcase />

      {/* How It Works */}
      <LightHowItWorks />

      {/* Footer */}
      <LightFooter />
    </div>
  )
}