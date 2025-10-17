"use client"

import React from "react"
import { TempMarketingLayout } from "./TempMarketingLayout"
import { TempAppShell } from "./TempAppShell"
import { TempCard } from "./TempCard"
import { TempButton } from "./TempButton"

interface TempPlaceholderProps {
  title: string
  description: string
  type?: "marketing" | "app"
  actions?: React.ReactNode
  children?: React.ReactNode
}

/**
 * Lightweight placeholder to show the new visual system on routes we haven't fully redesigned yet.
 */
export function TempPlaceholder({
  title,
  description,
  type = "marketing",
  actions,
  children,
}: TempPlaceholderProps) {
  if (type === "marketing") {
    return (
      <TempMarketingLayout>
        <section className="py-24">
          <div className="mx-auto w-[min(640px,94%)]">
            <TempCard className="space-y-6">
              <h1 className="text-3xl font-semibold md:text-4xl">
                {title}
              </h1>
              <p className="text-base md:text-lg text-slate-300">
                {description}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {actions || (
                  <>
                    <TempButton>Primary action</TempButton>
                    <TempButton variant="secondary">Secondary</TempButton>
                  </>
                )}
              </div>
              {children}
            </TempCard>
          </div>
        </section>
      </TempMarketingLayout>
    )
  }

  return (
    <TempAppShell
      title={title}
      description={description}
      actions={
        actions || (
          <TempButton variant="secondary" contrast="light">
            Example action
          </TempButton>
        )
      }
    >
      <TempCard tone="light" className="space-y-4">
        <p className="text-sm text-slate-600">
          This is a placeholder card illustrating spacing, typography, and surface
          treatment for this section in the refreshed system.
        </p>
        {children}
      </TempCard>
    </TempAppShell>
  )
}
