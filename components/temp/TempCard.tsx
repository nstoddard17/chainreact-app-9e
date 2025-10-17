"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface TempCardProps {
  children: React.ReactNode
  className?: string
  tone?: "dark" | "light"
}

export function TempCard({
  children,
  className,
  tone = "dark",
}: TempCardProps) {
  const tones = {
    dark: "bg-[#121a2b] border border-white/8 text-slate-100 shadow-[0_10px_24px_rgba(7,11,19,0.25)]",
    light:
      "bg-white border border-slate-200 text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.08)]",
  }

  return (
    <div
      className={cn(
        "rounded-2xl p-6 transition-all",
        tone === "dark"
          ? "hover:border-white/20"
          : "hover:border-slate-300",
        tones[tone],
        className
      )}
    >
      {children}
    </div>
  )
}
