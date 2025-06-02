"use client"

import type React from "react"

import { useEffect } from "react"
import { useAuthStore } from "@/stores/authStore"
import { useRouter } from "next/navigation"
import Sidebar from "./Sidebar"
import TopBar from "./TopBar"

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { initialize, user, loading, initialized } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    // Only initialize if not already initialized
    if (!initialized) {
      initialize()
    }
  }, [initialize, initialized])

  // Show loading only briefly while initializing
  if (!initialized && loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  // If no user after initialization, redirect to login
  if (initialized && !user) {
    router.push("/auth/login")
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-slate-600">Redirecting to login...</div>
      </div>
    )
  }

  // If we have a user or are in development mode, show the app
  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-64">
        <TopBar />
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
