"use client"

import React from "react"
import { TempHeader } from "@/components/temp-landing/TempHeader"
import { HeroSection } from "@/components/temp-landing/HeroSection"
import { WhyAutomationBreaks } from "@/components/temp-landing/WhyAutomationBreaks"
import { HowItWorks } from "@/components/temp-landing/HowItWorks"
import { AINodesSection } from "@/components/temp-landing/AINodesSection"
import { UseCasesSection } from "@/components/temp-landing/UseCasesSection"
import { FeaturesGrid } from "@/components/temp-landing/FeaturesGrid"
import { IntegrationsSection } from "@/components/temp-landing/IntegrationsSection"
import { PricingPreview } from "@/components/temp-landing/PricingPreview"
import { StatsSection } from "@/components/temp-landing/StatsSection"
import { FinalCTA } from "@/components/temp-landing/FinalCTA"
import { TempFooter } from "@/components/temp-landing/TempFooter"
import { ForceTheme } from '@/components/theme/ForceTheme'

// Orange variant of the landing page
// Uses CSS overrides to replace slate backgrounds with orange-tinted transparent ones
export default function OrangeLandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-orange-950 to-orange-900 orange-landing">
      <ForceTheme theme="light" />
      <style>{`
        /* Override section backgrounds to let the orange gradient show through */
        .orange-landing section[class*="bg-slate-950"],
        .orange-landing section[class*="bg-slate-900"] {
          background: transparent !important;
        }

        /* Cards and inner elements get semi-transparent backgrounds */
        .orange-landing section [class*="bg-slate-950"]:not(section) {
          background-color: rgba(15, 23, 42, 0.5) !important;
        }
        .orange-landing section [class*="bg-slate-900"]:not(section) {
          background-color: rgba(15, 23, 42, 0.4) !important;
        }

        /* Stats section */
        .orange-landing section[class*="border-t"][class*="bg-slate-950"] {
          background: transparent !important;
        }

        /* Footer gets a darker overlay */
        .orange-landing footer {
          background-color: rgba(2, 6, 23, 0.7) !important;
        }

        /* Alternating row backgrounds in comparison table */
        .orange-landing .grid.grid-cols-2[class*="bg-slate-950"] {
          background-color: rgba(15, 23, 42, 0.3) !important;
        }
        .orange-landing .grid.grid-cols-2[class*="bg-slate-900"] {
          background-color: rgba(15, 23, 42, 0.15) !important;
        }

        /* Border colors shift slightly warmer */
        .orange-landing section [class*="border-slate-800"] {
          border-color: rgba(255, 255, 255, 0.1) !important;
        }

        /* Header adjustments */
        .orange-landing header {
          border-color: rgba(255, 255, 255, 0.08) !important;
        }

        /* Mobile menu */
        .orange-landing .md\\:hidden[class*="bg-slate-900"] {
          background-color: rgba(15, 23, 42, 0.95) !important;
        }
      `}</style>
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
