"use client"

import React from 'react'
import { useTheme } from 'next-themes'
import { TempHeader } from './TempHeader'
import { HeroSection } from './HeroSection'
import { TrustBar } from './TrustBar'
import { WhyAutomationBreaks } from './WhyAutomationBreaks'
import { LearningLoopSection } from './LearningLoopSection'
import { AINodesSection } from './AINodesSection'
import { UseCasesSection } from './UseCasesSection'
import { FeatureShowcase } from './FeatureShowcase'
import { IntegrationsSection } from './IntegrationsSection'
import { PricingPreview } from './PricingPreview'
import { StatsSection } from './StatsSection'
import { FinalCTA } from './FinalCTA'
import { TempFooter } from './TempFooter'
import { FloatingThemeToggle } from './FloatingThemeToggle'

export function TempLanding() {
  const { setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    // Default to light mode for the landing page
    setTheme('light')
  }, [setTheme])

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <TempHeader />

      {/* Dark hero zone */}
      <HeroSection />
      <TrustBar />

      {/* Smooth gradient transition: dark → light */}
      <div className="h-20 bg-gradient-to-b from-slate-900 via-slate-900/40 to-transparent dark:from-slate-900 dark:to-slate-950" />

      {/* Core section — white, high priority */}
      <WhyAutomationBreaks />

      {/* How it works — white, high priority */}
      <LearningLoopSection />

      {/* AI Nodes — tinted background with warm accent */}
      <div className="relative">
        <div className="absolute inset-0 bg-[#fafafa] dark:bg-slate-900/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(251,146,60,0.04),transparent)] dark:bg-none" />
        <div className="relative">
          <AINodesSection />
        </div>
      </div>

      {/* Use cases — white */}
      <UseCasesSection />

      {/* Features — tinted background */}
      <div className="bg-[#fafafa] dark:bg-slate-900/30">
        <FeatureShowcase />
      </div>

      {/* Integrations — white */}
      <IntegrationsSection />

      {/* Pricing — tinted background with warm accent */}
      <div className="relative">
        <div className="absolute inset-0 bg-[#fafafa] dark:bg-slate-900/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(251,146,60,0.03),transparent)] dark:bg-none" />
        <div className="relative">
          <PricingPreview />
        </div>
      </div>

      {/* Stats — white, tight */}
      <StatsSection />

      {/* Final CTA — dark card, high emphasis */}
      <FinalCTA />

      <TempFooter />
      <FloatingThemeToggle />
    </div>
  )
}
