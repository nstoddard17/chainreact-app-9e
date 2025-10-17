"use client"

import React from "react"
import { TempTheme } from "./TempTheme"
import { TempNav } from "./TempNav"
import { TempFooter } from "./TempFooter"

interface TempMarketingLayoutProps {
  children: React.ReactNode
}

export function TempMarketingLayout({ children }: TempMarketingLayoutProps) {
  return (
    <TempTheme background="dark">
      <div className="min-h-screen bg-gradient-to-b from-[#0B1220] via-[#0E1626] to-[#0F172A]">
        <TempNav variant="marketing" />
        <main className="mx-auto w-[min(1120px,94%)] py-20 md:py-24 space-y-24 md:space-y-32">
          {children}
        </main>
        <TempFooter />
      </div>
    </TempTheme>
  )
}
