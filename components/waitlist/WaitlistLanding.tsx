"use client"

import React from 'react'
import Link from 'next/link'
import { WaitlistForm } from './WaitlistForm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Footer } from '@/components/homepage/Footer'
import {
  Sparkles,
  Globe,
  Lock,
  TrendingUp,
  Users,
  ArrowRight,
  Check,
  Zap,
} from 'lucide-react'

export function WaitlistLanding() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-orange-950 to-rose-950 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-3xl" />
      </div>

      {/* Grid Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Navigation */}
      <nav className="relative z-20 px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent hover:opacity-80 transition-opacity">
            ChainReact
          </Link>

          <Link href="/">
            <Button variant="ghost" className="text-white hover:bg-white/10">
              Back to Home
            </Button>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-16 sm:mb-24 space-y-8">
            <div className="inline-block animate-pulse">
              <Badge
                variant="outline"
                className="px-6 py-3 text-base sm:text-lg font-semibold border-2 border-orange-400 text-white bg-gradient-to-r from-orange-500/30 to-rose-500/30 backdrop-blur-sm shadow-lg shadow-orange-500/20"
              >
                <Sparkles className="h-5 w-5 mr-2 inline animate-spin" style={{ animationDuration: '3s' }} />
                Early Access Program
              </Badge>
            </div>

            <div className="space-y-6">
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold text-white leading-tight">
                The Future of
                <span className="block bg-gradient-to-r from-orange-400 via-rose-400 to-pink-400 bg-clip-text text-transparent">
                  Workflow Automation
                </span>
              </h1>
              <p className="text-xl sm:text-2xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
                Join the waitlist to be among the first to experience AI-powered
                workflow automation that connects your favorite tools seamlessly.
              </p>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap justify-center gap-8 sm:gap-12 pt-8">
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-white mb-1">
                  Universal
                </div>
                <div className="text-sm text-slate-400">Integrations</div>
              </div>
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-white mb-1">
                  AI-First
                </div>
                <div className="text-sm text-slate-400">Built for the future</div>
              </div>
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-white mb-1">
                  No-Code
                </div>
                <div className="text-sm text-slate-400">Visual builder</div>
              </div>
            </div>
          </div>

          {/* Waitlist Form */}
          <div className="mb-20">
            <WaitlistForm />
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
            <FeatureCard
              icon={<Globe className="h-6 w-6" />}
              title="Universal Connectivity"
              description="Connect all your favorite apps and services with a single click. From CRM to messaging, we've got you covered and growing."
            />
            <FeatureCard
              icon={<Sparkles className="h-6 w-6" />}
              title="AI-Powered Automation"
              description="Let AI build and optimize your workflows. Get intelligent suggestions and automated improvements."
            />
            <FeatureCard
              icon={<Zap className="h-6 w-6" />}
              title="Lightning Fast"
              description="Real-time execution with instant triggers. Your workflows run at the speed of thought."
            />
            <FeatureCard
              icon={<Lock className="h-6 w-6" />}
              title="Enterprise Security"
              description="Bank-grade encryption and compliance. Your data is safe with us, always."
            />
            <FeatureCard
              icon={<TrendingUp className="h-6 w-6" />}
              title="Scale Infinitely"
              description="From single workflows to enterprise automation. Grow without limits."
            />
            <FeatureCard
              icon={<Users className="h-6 w-6" />}
              title="Team Collaboration"
              description="Build together with your team. Share, iterate, and deploy workflows collaboratively."
            />
          </div>

          {/* What You'll Get Section */}
          <div className="max-w-3xl mx-auto mb-20">
            <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-8 sm:p-12">
              <h2 className="text-3xl font-bold text-white mb-8 text-center">
                What Early Access Members Get
              </h2>
              <ul className="space-y-4">
                {[
                  'Priority access to new features and integrations',
                  'Exclusive discounts on premium plans',
                  'Direct line to our product team',
                  'Influence the roadmap with your feedback',
                  'Premium support and onboarding',
                  'Limited-time founder benefits',
                ].map((benefit, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="bg-gradient-to-br from-orange-500 to-rose-600 p-1 rounded-full mt-0.5 flex-shrink-0">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-slate-200 text-lg">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center space-y-6 pb-20">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Ready to Transform Your Workflows?
            </h2>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              Don't miss out on being part of the automation revolution.
            </p>
            <Button
              size="lg"
              className="group relative bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 hover:from-orange-600 hover:via-rose-600 hover:to-pink-600 text-white text-lg sm:text-xl font-bold px-8 py-6 h-auto shadow-2xl shadow-rose-500/30 hover:shadow-rose-500/50 transition-all duration-300 hover:scale-105"
              onClick={() => {
                document.querySelector('form')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Join the Waitlist
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="group relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 hover:border-white/20 transition-all duration-300">
      <div className="bg-gradient-to-br from-orange-500/20 to-rose-600/20 p-3 rounded-lg w-fit mb-4 group-hover:scale-110 transition-transform">
        <div className="text-orange-400">{icon}</div>
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{description}</p>
    </div>
  )
}
