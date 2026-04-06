"use client"

import Image from 'next/image'
import { X, Check } from 'lucide-react'

const comparisons = [
  {
    other: 'Manual field mapping',
    chainreact: 'AI auto-fills every field',
  },
  {
    other: 'Rigid if/then logic',
    chainreact: 'Plain English conditions',
  },
  {
    other: 'Silent failures',
    chainreact: 'AI explains and fixes errors',
  },
  {
    other: 'Constant maintenance',
    chainreact: 'Self-improving workflows',
  },
]

export function WhyAutomationBreaks() {
  return (
    <section className="bg-slate-950 px-4 sm:px-6 lg:px-8 py-20">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
            Why automation keeps breaking
          </h2>
        </div>

        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-2">
            <div className="px-6 py-3 bg-slate-900 border-b border-slate-800">
              <span className="text-sm font-medium text-slate-500">Other tools</span>
            </div>
            <div className="px-6 py-3 bg-slate-900 border-b border-slate-800 border-l border-l-slate-800">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <Image src="/logo_transparent.png" alt="" width={16} height={16} />
                <span
                  className="bg-gradient-to-r from-slate-900 via-orange-600 to-slate-900 bg-clip-text text-transparent bg-[length:200%_100%] animate-[shimmer_3s_ease-in-out_infinite]"
                >
                  ChainReact
                </span>
              </span>
            </div>
          </div>

          {comparisons.map((item, index) => (
            <div
              key={index}
              className={`grid grid-cols-2 ${index % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/50'} ${index < comparisons.length - 1 ? 'border-b border-slate-800' : ''}`}
            >
              <div className="px-6 py-5 flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <X className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <span className="text-sm text-slate-400">{item.other}</span>
              </div>
              <div className="px-6 py-5 flex items-center gap-3 border-l border-slate-800">
                <div className="w-6 h-6 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-orange-500" />
                </div>
                <span className="text-sm font-medium text-white">{item.chainreact}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shimmer animation */}
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 100% 50%; }
          50% { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }
      `}</style>
    </section>
  )
}
