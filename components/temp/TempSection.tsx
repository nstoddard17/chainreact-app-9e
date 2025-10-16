"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface TempSectionProps {
  id?: string
  eyebrow?: string
  title: string
  description?: string
  className?: string
  children?: React.ReactNode
  align?: "left" | "center"
}

export function TempSection({
  id,
  eyebrow,
  title,
  description,
  className,
  children,
  align = "center",
}: TempSectionProps) {
  const alignment =
    align === "center"
      ? "text-center mx-auto"
      : "text-left md:w-[min(640px,100%)]"

  return (
    <section id={id} className={cn("py-16 md:py-24", className)}>
      <div className="mx-auto w-[min(1180px,94%)]">
        <header className={cn("mb-12", align === "center" ? "max-w-3xl" : "")}>
          {eyebrow && (
            <p className="mb-4 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-sky-300">
              {eyebrow}
            </p>
          )}
          <div className={cn("space-y-4", alignment)}>
            <h2 className="text-3xl font-semibold text-white md:text-4xl">
              {title}
            </h2>
            {description && (
              <p className="text-base text-slate-300 md:text-lg">
                {description}
              </p>
            )}
          </div>
        </header>
        {children}
      </div>
    </section>
  )
}

