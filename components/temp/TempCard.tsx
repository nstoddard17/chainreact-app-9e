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
    dark: "bg-white/[0.04] border border-white/10 shadow-[0_25px_60px_rgba(15,23,42,0.35)]",
    light:
      "bg-white border border-slate-200 shadow-[0_10px_40px_rgba(15,23,42,0.08)]",
  }

  return (
    <div
      className={cn(
        "rounded-3xl p-6 transition-all hover:-translate-y-1 hover:shadow-[0_35px_70px_rgba(15,23,42,0.35)]",
        tones[tone],
        className
      )}
    >
      {children}
    </div>
  )
}

