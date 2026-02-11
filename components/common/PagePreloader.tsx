"use client"

import React from "react"
import { Loader2 } from "lucide-react"
import { usePageDataPreloader, PageType } from "@/hooks/usePageDataPreloader"
import { ErrorBoundary } from "@/components/common/ErrorBoundary"

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
 * Shows a simple spinner in the content area until all data is ready (keeps sidebar visible)
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

  // Show simple spinner while data is being fetched
  if (isLoading || !isReady) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
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
