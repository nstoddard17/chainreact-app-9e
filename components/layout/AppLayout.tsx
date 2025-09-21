"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/authStore"
import Sidebar from "./Sidebar"
import TopBar from "./TopBar"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useTheme } from "next-themes"
import PageProtection from "@/components/auth/PageProtection"
import { LightningLoader } from "@/components/ui/lightning-loader"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { BetaBanner } from "@/components/ui/BetaBanner"
import { Footer } from "./Footer"

interface AppLayoutProps {
  children: React.ReactNode
  title: string
  subtitle?: string
}

export default function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const { initialize, user, hydrated } = useAuthStore()
  const { globalPreloadingData } = useIntegrationStore()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isClientReady, setIsClientReady] = useState(false)
  const { setTheme, theme } = useTheme()

  // Wait for client-side hydration to complete
  useEffect(() => {
    setIsClientReady(true)
  }, [])

  useEffect(() => {
    // Only initialize after hydration is complete
    if (hydrated) {
      initialize()
    }
  }, [initialize, hydrated])

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

  // Show loading screen only during initial hydration
  // After hydration, if there's no user, PageProtection will handle redirect
  if (!isClientReady || !hydrated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center">
        <LightningLoader size="lg" color="primary" />
      </div>
    )
  }

  // After hydration, if no user, PageProtection will redirect to login
  if (!user) {
    // Still show loader briefly while redirect happens
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center">
        <LightningLoader size="lg" color="primary" />
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
        <div className={`flex flex-col flex-1 min-h-screen transition-all duration-200 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-72'}`}>
          <BetaBanner />
          <TopBar
            onMobileMenuChange={setIsMobileMenuOpen}
            title={title}
            subtitle={subtitle}
          />
          {globalPreloadingData && (
            <div className="bg-blue-50 border-b border-blue-200 px-6 py-2">
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <LightningLoader size="sm" color="blue" />
                <span>Loading your integration data in the background...</span>
              </div>
            </div>
          )}
          <main className="flex-1 p-6 w-full">
            <ErrorBoundary context={`Page: ${title}`}>
              {children}
            </ErrorBoundary>
          </main>
          <Footer />
        </div>
      </div>
    </PageProtection>
  )
}
