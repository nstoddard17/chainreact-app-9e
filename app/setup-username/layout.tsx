"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { LightningLoader } from '@/components/ui/lightning-loader'
import { useTheme } from "next-themes"

interface SetupUsernameLayoutProps {
  children: React.ReactNode
}

export default function SetupUsernameLayout({ children }: SetupUsernameLayoutProps) {
  const { initialize, user, loading, initialized } = useAuthStore()
  const { setTheme, theme } = useTheme()

  useEffect(() => {
    initialize()
  }, [initialize])

  // Set default theme to dark for setup page
  useEffect(() => {
    if (theme === "system") {
      setTimeout(() => {
        setTheme("dark")
      }, 100)
    }
  }, [theme, setTheme])

  // Show loading while auth is initializing
  if (loading || !initialized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <LightningLoader size="lg" color="white" />
      </div>
    )
  }

  // Show loading while user is being determined
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <LightningLoader size="lg" color="white" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900">
      {children}
    </div>
  )
} 