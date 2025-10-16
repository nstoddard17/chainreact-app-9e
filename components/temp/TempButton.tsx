"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface TempButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost"
  size?: "md" | "lg"
}

export function TempButton({
  className,
  children,
  variant = "primary",
  size = "md",
  ...props
}: TempButtonProps) {
  const variants = {
    primary:
      "bg-gradient-to-r from-[#2563EB] via-[#4338CA] to-[#7C3AED] text-white shadow-lg shadow-blue-500/40 hover:shadow-xl hover:shadow-blue-500/50",
    secondary:
      "bg-white/10 text-white border border-white/15 hover:bg-white/15",
    ghost:
      "bg-transparent text-slate-200 border border-transparent hover:border-white/15 hover:bg-white/5",
  }

  const sizes = {
    md: "px-5 py-2.5 text-sm font-semibold",
    lg: "px-6 py-3 text-base font-semibold",
  }

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090E1A]",
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

