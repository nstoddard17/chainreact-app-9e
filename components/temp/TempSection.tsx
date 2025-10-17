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
  tone?: "dark" | "light"
}

export function TempSection({
  id,
  eyebrow,
  title,
  description,
  className,
  children,
  align = "left",
  tone = "dark",
}: TempSectionProps) {
  const alignment =
    align === "center" ? "text-center mx-auto" : "text-left"

  const textStyles =
    tone === "dark"
      ? {
          title: "text-slate-100",
          description: "text-slate-300",
          eyebrow:
            "border border-white/10 text-slate-200/80",
        }
      : {
          title: "text-slate-900",
          description: "text-slate-600",
          eyebrow:
            "border border-slate-200 text-slate-600",
        }

  return (
    <section id={id} className={cn("py-20 md:py-24", className)}>
      <div className="mx-auto w-[min(1120px,94%)] space-y-12">
        <header
          className={cn(
            "space-y-6",
            align === "center" ? "max-w-3xl mx-auto" : "max-w-3xl"
          )}
        >
          {eyebrow && (
            <p
              className={cn(
                "inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.32em]",
                tone === "dark" ? "bg-white/5" : "bg-white",
                textStyles.eyebrow,
                align === "center" ? "mx-auto" : ""
              )}
            >
              {eyebrow}
            </p>
          )}
          <div className={cn("space-y-4", alignment)}>
            <h2
              className={cn(
                "text-3xl font-semibold md:text-4xl",
                textStyles.title
              )}
            >
              {title}
            </h2>
            {description && (
              <p
                className={cn(
                  "text-base md:text-lg",
                  textStyles.description
                )}
              >
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
