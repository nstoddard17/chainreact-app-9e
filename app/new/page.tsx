import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function NewHomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-lg">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-xl font-semibold">
              ChainReact
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/auth/login" className="text-sm text-gray-400 hover:text-white transition-colors">
                Sign in
              </Link>
              <Link href="/auth/register">
                <Button size="sm" className="bg-white text-black hover:bg-gray-200">
                  Start building
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-7xl">
          {/* Hero Content */}
          <div className="text-center mb-16 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6 text-sm">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span className="text-gray-300">New: AI-Powered Workflow Automation</span>
              <ArrowRight className="w-4 h-4 text-gray-400" />
            </div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight tracking-tight">
              Purpose-built tool for
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                automating workflows
              </span>
            </h1>

            <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto leading-relaxed">
              Meet the system for modern workflow automation.
              <br />
              Streamline operations, integrate 20+ services, and build powerful automations.
            </p>

            <div className="flex items-center justify-center gap-4">
              <Link href="/auth/register">
                <Button size="lg" className="bg-white text-black hover:bg-gray-200 text-base px-6">
                  Start building
                </Button>
              </Link>
              <Link href="/templates">
                <Button size="lg" variant="ghost" className="text-gray-300 hover:text-white hover:bg-white/5 text-base">
                  Browse templates
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Screenshot Section - Full Width */}
      <section className="relative py-12 px-4 md:px-8 lg:px-12">
        <div className="relative mx-auto" style={{ maxWidth: '1800px' }}>
          {/* Enhanced Gradient glow effect */}
          <div className="absolute -inset-32 bg-gradient-to-b from-blue-500/30 via-purple-500/20 to-pink-500/10 blur-[100px] -z-10" />
          <div className="absolute -inset-24 bg-gradient-to-tr from-cyan-500/20 to-transparent blur-3xl -z-10" />

          {/* Main screenshot container with reduced tilt for better readability */}
          <div
            className="relative mx-auto"
            style={{
              perspective: '3000px',
            }}
          >
            <div
              className="relative transform-gpu transition-all duration-700 hover:scale-[1.01]"
              style={{
                transformStyle: 'preserve-3d',
                // Reduced tilt on mobile, full effect on desktop
                transform: 'rotateX(8deg) rotateY(-2deg) rotateZ(0.5deg)',
              }}
            >
              {/* Screenshot wrapper with border and shadow */}
              <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.8)]">
                {/* Top browser bar */}
                <div className="bg-[#1a1a1a] border-b border-white/5 px-6 py-4 flex items-center gap-3">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  </div>
                  <div className="flex-1 ml-4 text-sm text-gray-400">
                    AI Agent Test Workflow - Customer Service
                  </div>
                  <div className="text-xs text-gray-600 hidden md:block">
                    chainreact.app
                  </div>
                </div>

                {/* Actual workflow screenshot */}
                <div className="bg-[#0a0a0a] relative">
                  <img
                    src="/workflow-screenshot-full.png"
                    alt="ChainReact Workflow Builder showcasing an AI-powered customer service automation"
                    className="w-full h-auto"
                  />
                  {/* Subtle inner glow */}
                  <div className="absolute inset-0 bg-gradient-to-t from-blue-500/5 to-transparent pointer-events-none" />
                </div>
              </div>

              {/* Enhanced reflection effect */}
              <div
                className="absolute inset-0 bg-gradient-to-br from-blue-400/10 via-transparent to-purple-400/10 pointer-events-none rounded-2xl"
                style={{ transform: 'translateZ(10px)' }}
              />
            </div>

            {/* Ambient light spots */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] -z-20" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] -z-20" />
          </div>

          {/* Stats bar below screenshot */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            <div className="text-center space-y-1">
              <div className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                20+
              </div>
              <div className="text-sm text-gray-500">Integrations</div>
            </div>
            <div className="text-center space-y-1">
              <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                AI
              </div>
              <div className="text-sm text-gray-500">Powered</div>
            </div>
            <div className="text-center space-y-1">
              <div className="text-3xl font-bold bg-gradient-to-r from-pink-400 to-orange-400 bg-clip-text text-transparent">
                <span className="text-2xl">∞</span>
              </div>
              <div className="text-sm text-gray-500">Possibilities</div>
            </div>
            <div className="text-center space-y-1">
              <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                0
              </div>
              <div className="text-sm text-gray-500">Code Required</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-32 px-6 border-t border-white/5">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need to automate
            </h2>
            <p className="text-gray-400 text-lg">
              Powerful features that scale with your needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            <div className="group space-y-4 p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold">AI-Powered Automation</h3>
              <p className="text-gray-400 leading-relaxed">
                Build intelligent workflows with AI agents that understand context, analyze sentiment, and make decisions automatically.
              </p>
            </div>

            <div className="group space-y-4 p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold">20+ Integrations</h3>
              <p className="text-gray-400 leading-relaxed">
                Connect Gmail, Slack, Discord, Notion, Airtable, and more. Build workflows that span across your entire tool stack.
              </p>
            </div>

            <div className="group space-y-4 p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-orange-500/20 border border-pink-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold">Visual Workflow Builder</h3>
              <p className="text-gray-400 leading-relaxed">
                Design complex automations with our intuitive drag-and-drop interface. No code required, but powerful when you need it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="relative py-32 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Built for teams of all sizes
            </h2>
            <p className="text-gray-400 text-lg">
              From startups to enterprises, automate what matters
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-8 rounded-2xl border border-white/5 bg-gradient-to-br from-blue-500/5 to-transparent hover:border-white/10 transition-all">
              <h3 className="text-xl font-semibold mb-3">Customer Support</h3>
              <p className="text-gray-400 mb-4">
                Route inquiries, analyze sentiment, create tickets, and respond automatically with AI-powered workflows.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">Discord</span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">Gmail</span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">Airtable</span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">AI Agent</span>
              </div>
            </div>

            <div className="p-8 rounded-2xl border border-white/5 bg-gradient-to-br from-purple-500/5 to-transparent hover:border-white/10 transition-all">
              <h3 className="text-xl font-semibold mb-3">Lead Management</h3>
              <p className="text-gray-400 mb-4">
                Capture leads, enrich data, send follow-ups, and sync with your CRM—all automatically.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">HubSpot</span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">Slack</span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">Gmail</span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">AI Agent</span>
              </div>
            </div>

            <div className="p-8 rounded-2xl border border-white/5 bg-gradient-to-br from-pink-500/5 to-transparent hover:border-white/10 transition-all">
              <h3 className="text-xl font-semibold mb-3">Content Publishing</h3>
              <p className="text-gray-400 mb-4">
                Schedule posts, cross-post to multiple platforms, and track engagement across channels.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">Twitter</span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">LinkedIn</span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">Notion</span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">Airtable</span>
              </div>
            </div>

            <div className="p-8 rounded-2xl border border-white/5 bg-gradient-to-br from-green-500/5 to-transparent hover:border-white/10 transition-all">
              <h3 className="text-xl font-semibold mb-3">Data Sync & Backup</h3>
              <p className="text-gray-400 mb-4">
                Keep data in sync across tools, create backups, and ensure nothing falls through the cracks.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">Airtable</span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">Notion</span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">Drive</span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-400">OneDrive</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-32 px-6">
        <div className="container mx-auto max-w-4xl">
          <div className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-pink-500/10 p-12 md:p-16 text-center overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] -z-10" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] -z-10" />

            <h2 className="text-4xl md:text-5xl font-bold mb-6 relative z-10">
              Ready to automate your workflows?
            </h2>
            <p className="text-xl text-gray-400 mb-8 relative z-10 max-w-2xl mx-auto">
              Join teams building the future of workflow automation. Start free, no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
              <Link href="/auth/register" className="w-full sm:w-auto">
                <Button size="lg" className="bg-white text-black hover:bg-gray-200 text-base px-8 w-full">
                  Get started for free
                </Button>
              </Link>
              <Link href="/templates" className="w-full sm:w-auto">
                <Button size="lg" variant="ghost" className="text-gray-300 hover:text-white hover:bg-white/5 text-base border border-white/10 w-full">
                  View templates
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-sm text-gray-500">
              © 2025 ChainReact. All rights reserved.
            </div>
            <div className="flex gap-8">
              <Link href="/docs" className="text-sm text-gray-400 hover:text-white transition-colors">
                Documentation
              </Link>
              <Link href="/templates" className="text-sm text-gray-400 hover:text-white transition-colors">
                Templates
              </Link>
              <Link href="/pricing" className="text-sm text-gray-400 hover:text-white transition-colors">
                Pricing
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
