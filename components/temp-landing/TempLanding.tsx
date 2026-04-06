"use client"

import React from "react"
import { TempHeader } from "./TempHeader"
import { HeroSection } from "./HeroSection"
import { WhyAutomationBreaks } from "./WhyAutomationBreaks"
import { HowItWorks } from "./HowItWorks"
import { AINodesSection } from "./AINodesSection"
import { UseCasesSection } from "./UseCasesSection"
import { FeaturesGrid } from "./FeaturesGrid"
import { IntegrationsSection } from "./IntegrationsSection"
import { PricingPreview } from "./PricingPreview"
import { StatsSection } from "./StatsSection"
import { FinalCTA } from "./FinalCTA"
import { TempFooter } from "./TempFooter"

export function TempLanding() {
  return (
    <div className="min-h-screen bg-slate-950">
      <TempHeader />
      <HeroSection />
      <StatsSection />
      <WhyAutomationBreaks />
      <HowItWorks />
      <AINodesSection />
      <UseCasesSection />
      <FeaturesGrid />
      <IntegrationsSection />
      <PricingPreview />
      <FinalCTA />
      <TempFooter />
    </div>
  )
}
