"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import Sidebar from "./Sidebar"
import TopBar from "./TopBar"
import { useIntegrationStore } from "@/stores/integrationStore"
import { Loader2 } from "lucide-react"

interface AppLayoutProps {
  children: React.ReactNode
  title: string
}

export default function AppLayout({ children, title }: AppLayoutProps) {
  const { initialize, user } = useAuthStore()
  const { globalPreloadingData } = useIntegrationStore()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    initialize()
  }, [initialize])

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar isMobileMenuOpen={isMobileMenuOpen} onMobileMenuChange={setIsMobileMenuOpen} />
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      <div className="flex-1 flex flex-col lg:ml-64">
        <TopBar onMobileMenuChange={setIsMobileMenuOpen} title={title} />
        {globalPreloadingData && (
          <div className="bg-blue-50 border-b border-blue-200 px-6 py-2">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading your integration data in the background...</span>
            </div>
          </div>
        )}
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
