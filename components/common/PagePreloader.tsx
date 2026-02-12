"use client"

import React, { useEffect } from "react"
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
 * Wrapper component that triggers data preloading in the background
 * Shows children immediately - individual components handle their own loading states
 * This provides instant page transitions while data loads in background
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
  // Trigger data loading in background - don't block rendering
  const { preloadData } = usePageDataPreloader(
    pageType,
    {
      skipWorkflows,
      skipIntegrations,
      skipOrganizations,
      skipConversations,
      customLoaders
    }
  )

  // Trigger preload on mount (non-blocking)
  useEffect(() => {
    preloadData()
  }, [preloadData])

  // Always render children immediately - they handle their own loading states
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  )
}
