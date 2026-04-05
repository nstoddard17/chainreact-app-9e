"use client"

import { useRouter } from 'next/navigation'
import { ArrowRight, Zap, Shield, Globe, Target } from 'lucide-react'
import { PublicPageHeader } from '@/components/layout/PublicPageHeader'
import { TempFooter } from '@/components/temp-landing/TempFooter'

const values = [
  {
    icon: Zap,
    title: 'Speed over ceremony',
    description: 'We optimize for getting things done. Automations should take minutes to build, not days.',
  },
  {
    icon: Shield,
    title: 'Security by default',
    description: 'Enterprise-grade encryption, OAuth everywhere, row-level isolation. Security isn\'t an add-on.',
  },
  {
    icon: Globe,
    title: 'Open and extensible',
    description: 'Connect any tool, customize any workflow, publish templates for the community.',
  },
]

export default function AboutPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-white">
      <PublicPageHeader breadcrumb="About" />

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-16">
          <p className="text-sm font-medium text-orange-500 mb-2">About</p>
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            We&apos;re building the automation platform we wished existed.
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed">
            ChainReact is an AI-native workflow automation platform. We connect the tools you
            already use, let you build automations visually or with natural language, and
            execute them reliably - so you can focus on the work that actually matters.
          </p>
        </div>

        {/* Mission */}
        <div className="mb-16">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-orange-500" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Our Mission</h2>
          </div>
          <p className="text-gray-600 leading-relaxed mb-4">
            Automation shouldn&apos;t require a computer science degree. Existing tools are either
            too complex for non-developers or too limited for serious work. We set out to build
            something different - a platform where anyone can describe what they want to automate
            and get a working workflow in seconds.
          </p>
          <p className="text-gray-600 leading-relaxed">
            AI helps you build the workflow. The execution engine keeps it reliable. And the
            integrations ecosystem makes sure you can connect whatever you need.
          </p>
        </div>

        {/* Values */}
        <div className="mb-16">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">What We Believe</h2>
          <div className="space-y-6">
            {values.map((value) => (
              <div key={value.title} className="flex gap-4">
                <div className="shrink-0 w-10 h-10 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-center">
                  <value.icon className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">{value.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{value.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Story */}
        <div className="mb-16">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Our Story</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            Founded in 2024, ChainReact started from a simple frustration: why do automation
            tools still require you to manually wire up every field, learn provider-specific
            quirks, and debug broken connections without any help?
          </p>
          <p className="text-gray-600 leading-relaxed">
            We combined a visual workflow builder with an AI planner that actually understands
            what you&apos;re trying to do. The result is a platform where you can say &quot;send me a
            Slack message when I get a payment on Stripe&quot; and have a working workflow in under
            a minute - complete with proper authentication, error handling, and monitoring.
          </p>
        </div>

        {/* CTA */}
        <div className="bg-white border border-gray-200 rounded-lg p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Ready to try it?</h2>
            <p className="text-sm text-gray-600">Start building workflows in minutes. No credit card required.</p>
          </div>
          <button
            onClick={() => router.push('/waitlist')}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
          >
            Join the Waitlist
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>

      <TempFooter />
    </div>
  )
}
