"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface TempBadgeProps {
  children: React.ReactNode
  className?: string
  tone?: "blue" | "violet" | "neutral"
  contrast?: "dark" | "light"
}

export function TempBadge({
  children,
  className,
  tone = "blue",
  contrast = "dark",
}: TempBadgeProps) {
  const base =
    contrast === "dark"
      ? "border border-white/10"
      : "border border-slate-200 bg-white text-slate-700"

  const tones = {
    blue:
      contrast === "dark"
        ? "bg-blue-500/15 text-blue-100"
        : "bg-blue-50 text-blue-600 border-blue-200",
    violet:
      contrast === "dark"
        ? "bg-violet-500/15 text-violet-100"
        : "bg-violet-50 text-violet-600 border-violet-200",
    neutral:
      contrast === "dark"
        ? "bg-white/10 text-slate-200"
        : "bg-slate-100 text-slate-700 border-slate-200",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em]",
        base,
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
