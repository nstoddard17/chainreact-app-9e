"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface TempBadgeProps {
  children: React.ReactNode
  className?: string
  tone?: "blue" | "violet" | "neutral"
}

export function TempBadge({
  children,
  className,
  tone = "blue",
}: TempBadgeProps) {
  const tones = {
    blue: "bg-blue-500/10 text-blue-200 border border-blue-500/30",
    violet: "bg-violet-500/10 text-violet-200 border border-violet-500/30",
    neutral: "bg-white/5 text-slate-200 border border-white/10",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.3em]",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

