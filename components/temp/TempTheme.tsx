"use client"

import React from "react"
import { Inter, Space_Grotesk } from "next/font/google"
import { cn } from "@/lib/utils"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-temp-inter",
  display: "swap",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-temp-grotesk",
  display: "swap",
})

interface TempThemeProps {
  children: React.ReactNode
  background?: "dark" | "light"
}

/**
 * Provides a self-contained visual foundation for the new concept pages.
 * It intentionally avoids touching global CSS to keep the experiments isolated.
 */
export function TempTheme({ children, background = "dark" }: TempThemeProps) {
  const palette =
    background === "dark"
      ? "bg-[#0B1220] text-slate-100"
      : "bg-slate-50 text-slate-900"

  return (
    <div
      className={cn(
        spaceGrotesk.variable,
        inter.variable,
        "min-h-screen antialiased tracking-tight font-sans",
        palette
      )}
    >
      {children}
    </div>
  )
}
