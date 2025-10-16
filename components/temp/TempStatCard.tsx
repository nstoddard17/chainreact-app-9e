"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface TempStatCardProps {
  label: string
  value: string
  change?: string
  tone?: "blue" | "green" | "purple"
  icon?: React.ReactNode
}

const toneStyles = {
  blue: {
    chip: "bg-blue-500/15 text-blue-500",
    accent: "from-blue-500/10 via-blue-500/5 to-transparent border-blue-500/20",
  },
  green: {
    chip: "bg-emerald-500/15 text-emerald-500",
    accent:
      "from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/20",
  },
  purple: {
    chip: "bg-violet-500/15 text-violet-500",
    accent:
      "from-violet-500/10 via-violet-500/5 to-transparent border-violet-500/20",
  },
}

export function TempStatCard({
  label,
  value,
  change,
  tone = "blue",
  icon,
}: TempStatCardProps) {
  const toneClass = toneStyles[tone]

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_25px_60px_rgba(15,23,42,0.08)]">
      <div
        className={cn(
          "absolute inset-0 -z-10 bg-gradient-to-br opacity-80",
          toneClass.accent
        )}
      />
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
              toneClass.chip
            )}
          >
            {label}
          </span>
          <div>
            <p className="text-3xl font-semibold text-slate-900">{value}</p>
            {change && (
              <p className="mt-1 text-sm text-slate-500">vs last 30 days</p>
            )}
          </div>
        </div>
        {icon && (
          <div className="rounded-2xl bg-white/80 p-3 text-slate-500 shadow-sm">
            {icon}
          </div>
        )}
      </div>
      {change && (
        <p className="mt-6 text-sm font-medium text-emerald-500">{change}</p>
      )}
    </div>
  )
}

