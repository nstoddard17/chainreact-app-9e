"use client"

import React from 'react'
import { useTheme } from 'next-themes'
import { HomepageHeader } from '@/components/layout/HomepageHeader'
import { Footer } from '@/components/homepage/Footer'
import { NewHeroSection } from './NewHeroSection'
import { HITLDemo } from './HITLDemo'
import { UseCasesSection } from './UseCasesSection'
import { FlexibilitySection } from './FlexibilitySection'
import { IntegrationsShowcase } from '@/components/homepage/IntegrationsShowcase'
import { SocialProofSection } from './SocialProofSection'
import { AnimatedBackground } from './AnimatedBackground'

export function NewHomepage() {
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
    <div className="min-h-screen relative">
      {/* Animated Background */}
      <AnimatedBackground />

      {/* Navigation */}
      <HomepageHeader />

      {/* Main Content - Clean flow without background changes */}
      <NewHeroSection />
      <HITLDemo />
      <FlexibilitySection />
      <UseCasesSection />
      <IntegrationsShowcase />
      <SocialProofSection />
      <Footer />
    </div>
  )
}
