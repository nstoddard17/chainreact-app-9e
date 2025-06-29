"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import { Loader2 } from "lucide-react"
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    )
  }

  // Show loading while user is being determined
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900">
      {children}
    </div>
  )
} 