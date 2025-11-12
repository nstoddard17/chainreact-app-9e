"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface ConfigurationSectionHeaderProps {
  label?: React.ReactNode
  caption?: string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  className?: string
}

export function ConfigurationSectionHeader({
  label,
  caption,
  prefix,
  suffix,
  className,
}: ConfigurationSectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-border/50 pb-1",
        className
      )}
    >
      <div className="flex items-center gap-2">
        {prefix}
        {label !== undefined && label !== null && (
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            {label}
          </p>
        )}
      </div>
      {suffix ??
        (caption ? (
          <span className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground/80">
            {caption}
          </span>
        ) : null)}
    </div>
  )
}
