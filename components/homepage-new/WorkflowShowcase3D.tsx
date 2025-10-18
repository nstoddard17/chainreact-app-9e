"use client"

import React from 'react'

export function WorkflowShowcase3D() {
  return (
    <section className="relative py-12 px-4 md:px-8 lg:px-12">
      <div className="relative mx-auto" style={{ maxWidth: '1800px' }}>
        {/* Screenshot wrapper - keeping it simple like the working debug version */}
        <div className="relative rounded-2xl overflow-hidden border border-gray-200 dark:border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_80px_rgba(0,0,0,0.8)]">
          {/* Top browser bar */}
          <div className="bg-gray-100 dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-white/5 px-6 py-4 flex items-center gap-3">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <div className="flex-1 ml-4 text-sm text-gray-600 dark:text-gray-400">
              AI Agent Test Workflow - Customer Service
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-600 hidden md:block">
              chainreact.app
            </div>
          </div>

          {/* Actual workflow screenshot */}
          <div className="bg-white dark:bg-[#0a0a0a] relative">
            <img
              src="/workflow-screenshot-full.png"
              alt="ChainReact Workflow Builder showcasing an AI-powered customer service automation"
              className="w-full h-auto"
            />
          </div>
        </div>

        {/* Stats bar below screenshot */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
          <div className="text-center space-y-1">
            <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
              20+
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-500">Integrations</div>
          </div>
          <div className="text-center space-y-1">
            <div className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
              AI
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-500">Powered</div>
          </div>
          <div className="text-center space-y-1">
            <div className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 dark:from-pink-400 dark:to-orange-400 bg-clip-text text-transparent">
              <span className="text-2xl">∞</span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-500">Possibilities</div>
          </div>
          <div className="text-center space-y-1">
            <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent">
              0
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-500">Code Required</div>
          </div>
        </div>
      </div>
    </section>
  )
}
