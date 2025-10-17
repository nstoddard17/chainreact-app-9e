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
    chip: "bg-blue-100 text-blue-600",
  },
  green: {
    chip: "bg-emerald-100 text-emerald-600",
  },
  purple: {
    chip: "bg-violet-100 text-violet-600",
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-4">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em]",
              "border border-transparent",
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
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-500">
            {icon}
          </div>
        )}
      </div>
      {change && (
        <p
          className={cn(
            "mt-6 text-sm font-semibold",
            change.startsWith("-") ? "text-rose-500" : "text-emerald-600"
          )}
        >
          {change}
        </p>
      )}
    </div>
  )
}
