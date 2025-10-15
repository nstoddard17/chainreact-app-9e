"use client"

import React, { useState } from 'react'
import { HeroSection } from './HeroSection'
import { WorkflowAnimation } from './WorkflowAnimation'
import { FeaturesGrid } from './FeaturesGrid'
import { IntegrationsShowcase } from './IntegrationsShowcase'
import { HowItWorks } from './HowItWorks'
import { Footer } from './Footer'
import { ChainReactLogo } from './ChainReactLogo'
import { WaitlistModal } from './WaitlistModal'
import { Button } from '@/components/ui/button'

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Integrations', href: '#integrations' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Demo', href: '#workflow-demo' },
]

export function NewHomepage() {
  const [waitlistOpen, setWaitlistOpen] = useState(false)

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-white">
      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(165,180,252,0.1),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(15,23,42,0.92),rgba(30,64,175,0.7))]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_70%)]" />
      </div>

      <header className="relative z-30 border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <ChainReactLogo />
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-white/70">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
          <Button
            size="lg"
            className="hidden sm:inline-flex bg-white/10 text-white hover:bg-white/20"
            onClick={() => setWaitlistOpen(true)}
          >
            Join waitlist
          </Button>
        </div>
      </header>

      <main className="relative z-20 flex flex-col gap-10 lg:gap-0">
        <HeroSection onJoinWaitlist={() => setWaitlistOpen(true)} />
        <WorkflowAnimation />
        <FeaturesGrid />
        <IntegrationsShowcase />
        <HowItWorks />
      </main>

      <Footer />

      <WaitlistModal open={waitlistOpen} onOpenChange={setWaitlistOpen} />
    </div>
  )
}
