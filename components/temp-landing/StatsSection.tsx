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
    <section className="bg-[#fafafa] py-16 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-bold text-slate-900">
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
