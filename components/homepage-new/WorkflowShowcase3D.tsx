"use client"

import React from 'react'

export function WorkflowShowcase3D() {
  return (
    <section className="relative py-12 px-4 md:px-8 lg:px-12">
      <div className="relative mx-auto" style={{ maxWidth: '1800px' }}>
        {/* DEBUG: Simple container - no animations, no transforms */}
        <div className="relative mx-auto bg-red-500/10 p-4">
          <p className="text-center mb-4 text-white dark:text-white">DEBUG: Container visible</p>

          {/* Screenshot wrapper with border and shadow */}
          <div className="relative rounded-2xl overflow-hidden border-2 border-blue-500">
            {/* Top browser bar */}
            <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center gap-3">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <div className="flex-1 ml-4 text-sm text-white">
                AI Agent Test Workflow - Customer Service
              </div>
            </div>

            {/* Actual workflow screenshot */}
            <div className="bg-gray-900 relative p-4">
              <p className="text-white mb-2">DEBUG: Image container</p>
              <img
                src="/workflow-screenshot-full.png"
                alt="ChainReact Workflow Builder"
                className="w-full h-auto border-2 border-green-500"
                onError={(e) => {
                  console.error('Image failed to load')
                  e.currentTarget.style.border = '2px solid red'
                }}
                onLoad={() => {
                  console.log('Image loaded successfully!')
                }}
              />
              <p className="text-white mt-2">DEBUG: After image tag</p>
            </div>
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
