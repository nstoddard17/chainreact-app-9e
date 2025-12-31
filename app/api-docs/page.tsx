"use client"

import React from 'react'
import Link from 'next/link'
import { ArrowLeft, Code, Webhook, Database, Shield, Zap, GitBranch, Key } from 'lucide-react'

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Navigation */}
      <nav className="relative z-40 px-4 sm:px-6 lg:px-8 py-6 bg-slate-900/50 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link
            href="/home"
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold">Back to Home</span>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative z-10 px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/10 border border-rose-500/20 mb-6">
              <Code className="w-4 h-4 text-rose-400" />
              <span className="text-sm font-semibold text-rose-300">Developer API</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
              Build Custom Integrations
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Use our powerful API to create custom integrations, automate workflows programmatically,
              and extend ChainReact to meet your unique needs.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 p-2.5 mb-4">
                <Webhook className="w-full h-full text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Webhooks</h3>
              <p className="text-gray-400">
                Receive real-time notifications when workflows execute, complete, or fail.
              </p>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 p-2.5 mb-4">
                <Database className="w-full h-full text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Data Access</h3>
              <p className="text-gray-400">
                Read and write data from your workflows, manage executions, and access logs.
              </p>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 p-2.5 mb-4">
                <Shield className="w-full h-full text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Secure Authentication</h3>
              <p className="text-gray-400">
                OAuth 2.0 and API key authentication with granular permission scopes.
              </p>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 p-2.5 mb-4">
                <Zap className="w-full h-full text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Real-time Execution</h3>
              <p className="text-gray-400">
                Trigger workflows programmatically and monitor their execution status.
              </p>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 p-2.5 mb-4">
                <GitBranch className="w-full h-full text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Workflow Management</h3>
              <p className="text-gray-400">
                Create, update, and delete workflows through our comprehensive REST API.
              </p>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-white/20 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 p-2.5 mb-4">
                <Key className="w-full h-full text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Custom Actions</h3>
              <p className="text-gray-400">
                Register custom actions that can be used in workflows like native integrations.
              </p>
            </div>
          </div>

          {/* Code Example */}
          <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/10 p-8 mb-16">
            <h2 className="text-2xl font-bold text-white mb-6">Quick Start Example</h2>
            <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
              <code className="text-sm text-gray-300">{`// Trigger a workflow programmatically
const response = await fetch('https://api.chainreact.ai/v1/workflows/trigger', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    workflow_id: 'wf_123456',
    payload: {
      email: 'user@example.com',
      data: { /* your custom data */ }
    }
  })
});

const result = await response.json();
console.log('Workflow triggered:', result.execution_id);`}</code>
            </pre>
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <div className="bg-gradient-to-r from-rose-900/20 to-pink-900/20 border border-rose-500/20 rounded-2xl p-8 inline-block">
              <h2 className="text-3xl font-bold text-white mb-4">
                Ready to Build?
              </h2>
              <p className="text-gray-300 mb-6 max-w-2xl">
                Full API documentation is coming soon. Join the waitlist to get early access
                and be notified when our developer portal launches.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/request-integration"
                  className="px-8 py-3 bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-700 hover:to-rose-700 text-white font-semibold rounded-xl shadow-2xl shadow-rose-500/25 hover:shadow-rose-500/40 transition-all duration-300 transform hover:scale-105"
                >
                  Request Integration Access
                </Link>
                <button
                  className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl border border-white/20 transition-all duration-300"
                  onClick={() => window.open('mailto:api@chainreact.ai', '_blank')}
                >
                  Contact Sales
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}