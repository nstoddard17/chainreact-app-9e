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
      <div className="relative overflow-hidden">
        <TempNav variant="marketing" />

        <main className="relative z-10">{children}</main>

        <TempFooter />

        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-[#1B3A7C]/30 blur-[120px]" />
          <div className="absolute right-[-10%] top-1/3 h-[440px] w-[440px] rounded-full bg-[#7C3AED]/20 blur-[120px]" />
          <div className="absolute left-[-10%] bottom-0 h-[520px] w-[520px] rounded-full bg-[#0EA5E9]/20 blur-[150px]" />
        </div>
      </div>
    </TempTheme>
  )
}

