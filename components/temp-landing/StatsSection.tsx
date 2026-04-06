"use client"

import React from 'react'

const stats = [
  { value: "247+", label: "Workflow nodes" },
  { value: "35+", label: "Integrations" },
  { value: "<100ms", label: "Avg response" },
  { value: "60s", label: "AI builds a workflow" },
]

export function StatsSection() {
  return (
    <section className="relative bg-slate-950 py-10 px-6 border-t border-white/5">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-slate-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
