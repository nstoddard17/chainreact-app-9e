"use client"

import React from 'react'
import { NewHeader } from './NewHeader'
import { NewHeroSection } from './NewHeroSection'
import { NewWorkflowAnimation } from './NewWorkflowAnimation'
import { NewFeaturesGrid } from './NewFeaturesGrid'
import { NewIntegrationsShowcase } from './NewIntegrationsShowcase'
import { NewHowItWorks } from './NewHowItWorks'
import { NewFooter } from './NewFooter'

export function NewHomepage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <NewHeader />
      <main>
        <NewHeroSection />
        <NewWorkflowAnimation />
        <NewFeaturesGrid />
        <NewIntegrationsShowcase />
        <NewHowItWorks />
      </main>
      <NewFooter />
    </div>
  )
}
