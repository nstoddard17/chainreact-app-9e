"use client"

import React from 'react'
import { HeroSection } from './HeroSection'
import { WorkflowAnimation } from './WorkflowAnimation'
import { FeaturesGrid } from './FeaturesGrid'
import { IntegrationsShowcase } from './IntegrationsShowcase'
import { HowItWorks } from './HowItWorks'
import { Footer } from './Footer'
import { ChainReactLogo } from './ChainReactLogo'

export function NewHomepage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 overflow-x-hidden">
      {/* Animated background particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse [animation-delay:2s]"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse [animation-delay:4s]"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-50 px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <ChainReactLogo />
          <div className="flex items-center gap-6">
            <a href="#features" className="text-white/80 hover:text-white transition-colors">
              Features
            </a>
            <a href="#integrations" className="text-white/80 hover:text-white transition-colors">
              Integrations
            </a>
            <a href="#how-it-works" className="text-white/80 hover:text-white transition-colors">
              How it Works
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section with Workflow Animation */}
      <HeroSection />

      {/* Interactive Workflow Animation */}
      <WorkflowAnimation />

      {/* Features Grid */}
      <FeaturesGrid />

      {/* Integrations Showcase */}
      <IntegrationsShowcase />

      {/* How It Works */}
      <HowItWorks />

      {/* Footer */}
      <Footer />
    </div>
  )
}