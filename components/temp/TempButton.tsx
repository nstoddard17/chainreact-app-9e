"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface TempButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost"
  size?: "md" | "lg"
  contrast?: "dark" | "light"
}

export function TempButton({
  className,
  children,
  variant = "primary",
  size = "md",
  contrast = "dark",
  ...props
}: TempButtonProps) {
  const variants = {
    primary:
      contrast === "dark"
        ? "bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
        : "bg-[#2563EB] text-white hover:bg-[#1D4ED8]",
    secondary:
      contrast === "dark"
        ? "bg-white/10 text-slate-100 border border-white/20 hover:bg-white/20"
        : "bg-white text-slate-900 border border-slate-200 hover:bg-slate-100",
    ghost:
      contrast === "dark"
        ? "bg-transparent text-slate-200 border border-transparent hover:border-white/20 hover:bg-white/10"
        : "bg-transparent text-slate-700 border border-transparent hover:bg-slate-100",
  }

  const sizes = {
    md: "px-5 py-2.5 text-sm font-semibold",
    lg: "px-6 py-3 text-base font-semibold",
  }

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2",
        contrast === "dark" ? "focus-visible:ring-offset-[#0B1220]" : "focus-visible:ring-offset-slate-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
