"use client"

import React from "react"
import { FullScreenLoadingScreen } from "@/components/ui/loading-screen"
import { usePageDataPreloader, PageType } from "@/hooks/usePageDataPreloader"
import { ErrorBoundary } from "@/components/common/ErrorBoundary"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PagePreloaderProps {
  pageType: PageType
  children: React.ReactNode
  loadingTitle?: string
  loadingDescription?: string
  skipWorkflows?: boolean
  skipIntegrations?: boolean
  skipOrganizations?: boolean
  skipConversations?: boolean
  customLoaders?: Array<() => Promise<void>>
}

/**
 * Wrapper component that preloads all necessary data before showing page content
 * Shows a full-screen loading state until all data is ready
 */
export function PagePreloader({
  pageType,
  children,
  loadingTitle,
  loadingDescription,
  skipWorkflows,
  skipIntegrations,
  skipOrganizations,
  skipConversations,
  customLoaders
}: PagePreloaderProps) {
  const { isLoading, isReady, error, loadingMessage, preloadData } = usePageDataPreloader(
    pageType,
    {
      skipWorkflows,
      skipIntegrations,
      skipOrganizations,
      skipConversations,
      customLoaders
    }
  )

  // Show loading screen while data is being fetched
  if (isLoading || !isReady) {
    return (
      <FullScreenLoadingScreen
        title={loadingTitle || `Loading ${pageType}`}
        description={loadingDescription || loadingMessage}
      />
    )
  }

  // All data loaded successfully or with non-critical errors, show the page
  // If there's an error, it will be logged and the page components can handle missing data gracefully
  // Wrap in ErrorBoundary to catch chunk loading errors and other runtime errors
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  )
}
