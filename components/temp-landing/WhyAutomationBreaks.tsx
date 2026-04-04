"use client"

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
    <section className="bg-white px-4 sm:px-6 lg:px-8 py-20">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-4">
            Why automation keeps breaking
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-2">
            <div className="px-6 py-3 bg-slate-100 border-b border-slate-200">
              <span className="text-sm font-medium text-slate-500">Other tools</span>
            </div>
            <div className="px-6 py-3 bg-slate-100 border-b border-slate-200 border-l border-l-slate-200">
              <span className="text-sm font-medium text-orange-600">ChainReact</span>
            </div>
          </div>

          {comparisons.map((item, index) => (
            <div
              key={index}
              className={`grid grid-cols-2 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} ${index < comparisons.length - 1 ? 'border-b border-slate-200' : ''}`}
            >
              <div className="px-6 py-5 flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <X className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <span className="text-sm text-slate-500">{item.other}</span>
              </div>
              <div className="px-6 py-5 flex items-center gap-3 border-l border-slate-200">
                <div className="w-6 h-6 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-orange-500" />
                </div>
                <span className="text-sm font-medium text-slate-900">{item.chainreact}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
