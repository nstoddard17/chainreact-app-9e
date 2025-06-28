"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import Sidebar from "./Sidebar"
import TopBar from "./TopBar"
import { useIntegrationStore } from "@/stores/integrationStore"
import { Loader2 } from "lucide-react"
import { useTheme } from "next-themes"
import PageProtection from "@/components/auth/PageProtection"

interface AppLayoutProps {
  children: React.ReactNode
  title: string
  subtitle?: string
}

export default function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const { initialize, user } = useAuthStore()
  const { globalPreloadingData } = useIntegrationStore()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const { setTheme, theme } = useTheme()

  useEffect(() => {
    initialize()
  }, [initialize])

  // Load sidebar collapsed state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed')
    if (savedState !== null) {
      setIsSidebarCollapsed(JSON.parse(savedState))
    }
  }, [])

  // Save sidebar collapsed state to localStorage when it changes
  const handleToggleCollapse = () => {
    const newState = !isSidebarCollapsed
    setIsSidebarCollapsed(newState)
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newState))
  }

  // Set default theme to dark for dashboard users (non-blocking)
  useEffect(() => {
    if (user && theme === "system") {
      // Use setTimeout to make this non-blocking
      setTimeout(() => {
        setTheme("dark")
      }, 100)
    }
  }, [user, theme, setTheme])

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <PageProtection>
      <div className="min-h-screen bg-background flex">
        {/* Hidden dummy password field to trap browser autofill globally */}
        <input
          type="password"
          name="fake-password-global"
          autoComplete="new-password"
          style={{ display: 'none' }}
          tabIndex={-1}
        />
        <Sidebar 
          isMobileMenuOpen={isMobileMenuOpen} 
          onMobileMenuChange={setIsMobileMenuOpen}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
        <div className={`flex-1 flex flex-col transition-all duration-200 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
          <TopBar 
            onMobileMenuChange={setIsMobileMenuOpen} 
            title={title}
            subtitle={subtitle}
          />
          {globalPreloadingData && (
            <div className="bg-blue-50 border-b border-blue-200 px-6 py-2">
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading your integration data in the background...</span>
              </div>
            </div>
          )}
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </PageProtection>
  )
}
