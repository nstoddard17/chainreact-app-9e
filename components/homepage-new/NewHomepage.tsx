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
