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
      ? "bg-[#090E1A] text-[#E2E8F0]"
      : "bg-[#F8FAFC] text-[#0F172A]"

  return (
    <div
      className={cn(
        spaceGrotesk.variable,
        inter.variable,
        "min-h-screen",
        "antialiased",
        palette,
        "tracking-tight"
      )}
    >
      {children}
    </div>
  )
}

