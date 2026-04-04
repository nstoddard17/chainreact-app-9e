"use client"

import React from 'react'
import { useTheme } from 'next-themes'
import { TempHeader } from './TempHeader'
import { HeroSection } from './HeroSection'
import { TrustBar } from './TrustBar'
import { WhyAutomationBreaks } from './WhyAutomationBreaks'
import { LearningLoopSection } from './LearningLoopSection'
import { UseCasesSection } from './UseCasesSection'
import { FeatureShowcase } from './FeatureShowcase'
import { IntegrationsSection } from './IntegrationsSection'
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
      <HeroSection />
      <TrustBar />
      <WhyAutomationBreaks />
      <LearningLoopSection />
      <UseCasesSection />
      <FeatureShowcase />
      <IntegrationsSection />
      <StatsSection />
      <FinalCTA />
      <TempFooter />
      <FloatingThemeToggle />
    </div>
  )
}
