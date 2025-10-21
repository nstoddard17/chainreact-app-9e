"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useOrganizationStore } from "@/stores/organizationStore"
import { logger } from "@/lib/utils/logger"

export type PageType =
  | "workflows"
  | "ai-assistant"
  | "settings"
  | "templates"
  | "analytics"
  | "teams"
  | "apps"

interface PreloadOptions {
  /** Skip certain data loads if not needed for the page */
  skipWorkflows?: boolean
  skipIntegrations?: boolean
  skipOrganizations?: boolean
  skipConversations?: boolean
  /** Custom data loaders to run */
  customLoaders?: Array<() => Promise<void>>
}

interface UsePageDataPreloaderResult {
  isLoading: boolean
  isReady: boolean
  error: Error | null
  loadingMessage: string
  preloadData: () => Promise<void>
}

/**
 * Hook to preload all necessary data for a page before rendering
 * Ensures smooth page transitions with no spinning loaders after initial load
 */
export function usePageDataPreloader(
  pageType: PageType,
  options: PreloadOptions = {}
): UsePageDataPreloaderResult {
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [loadingMessage, setLoadingMessage] = useState("Initializing...")

  // Use ref instead of state to prevent re-renders
  const hasRunRef = useRef(false)
  const isRunningRef = useRef(false)

  const { fetchWorkflows } = useWorkflowStore()
  const { user, initialized: authInitialized } = useAuthStore()
  const { fetchIntegrations } = useIntegrationStore()
  const { fetchOrganizations } = useOrganizationStore()

  const preloadData = useCallback(async () => {
    // Only run once! Use ref to avoid re-render loops
    if (hasRunRef.current || isRunningRef.current) {
      logger.info('usePageDataPreloader', 'Already loaded or currently loading, skipping')
      return
    }
    if (!authInitialized || !user) {
      logger.info('usePageDataPreloader', 'Auth not initialized, waiting...')
      return
    }

    isRunningRef.current = true

    setIsLoading(true)
    setError(null)

    // Keep trying until all data loads successfully
    let retryCount = 0
    const maxRetries = 50 // Effectively infinite, but prevents true infinite loop
    let success = false

    while (!success && retryCount < maxRetries) {
      try {
        const loaders: Array<{ name: string; loader: () => Promise<void> }> = []

        // Always load integrations unless explicitly skipped
        if (!options.skipIntegrations) {
          loaders.push({
            name: "integrations",
            loader: async () => {
              setLoadingMessage("Loading connected apps...")
              await fetchIntegrations()
            }
          })
        }

        // Load workflows for relevant pages
        if (!options.skipWorkflows && ["workflows", "templates", "analytics"].includes(pageType)) {
          loaders.push({
            name: "workflows",
            loader: async () => {
              setLoadingMessage("Loading your workflows...")
              await fetchWorkflows()
            }
          })
        }

        // Load organizations for team/settings pages
        if (!options.skipOrganizations && ["teams", "settings"].includes(pageType)) {
          loaders.push({
            name: "organizations",
            loader: async () => {
              setLoadingMessage("Loading workspaces...")
              await fetchOrganizations()
            }
          })
        }

        // AI Assistant specific loads
        if (pageType === "ai-assistant" && !options.skipConversations) {
          loaders.push({
            name: "conversations",
            loader: async () => {
              setLoadingMessage("Loading chat history...")
              // Conversations are loaded by AIAssistantContent on mount
              // We just add a small delay to ensure the component is ready
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          })
        }

        // Add custom loaders
        if (options.customLoaders && options.customLoaders.length > 0) {
          options.customLoaders.forEach((loader, index) => {
            loaders.push({
              name: `custom-${index}`,
              loader: async () => {
                setLoadingMessage("Loading additional data...")
                await loader()
              }
            })
          })
        }

        // Execute all loaders sequentially with progress updates
        // If ANY fail, we'll retry from the beginning
        for (const { name, loader } of loaders) {
          logger.info('usePageDataPreloader', `Loading ${name} for ${pageType}`)
          await loader()
        }

        setLoadingMessage("Finalizing...")
        // Small delay to ensure all state updates are processed
        await new Promise(resolve => setTimeout(resolve, 150))

        // All loaders succeeded!
        success = true
        hasRunRef.current = true // Mark as completed
        isRunningRef.current = false
        setIsReady(true)
        logger.info('usePageDataPreloader', `Page data preload complete for ${pageType}`)
      } catch (err) {
        retryCount++
        const error = err instanceof Error ? err : new Error('Failed to load page data')
        logger.warn('usePageDataPreloader', `Failed to preload data for ${pageType}, retrying... (attempt ${retryCount})`, error)
        setError(error)

        // Wait before retrying (exponential backoff)
        const delayMs = Math.min(1000 * Math.pow(2, retryCount - 1), 5000) // Cap at 5 seconds
        setLoadingMessage(`Connection issue detected. Retrying in ${Math.ceil(delayMs / 1000)}s...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }

    if (!success) {
      logger.error('usePageDataPreloader', `Max retries reached for ${pageType}`)
      isRunningRef.current = false
      // Still stuck after max retries - this should rarely happen
      setLoadingMessage("Unable to connect. Please check your network connection.")
    }

    setIsLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Only depend on things that should trigger a reload
    authInitialized,
    user,
    pageType
    // Intentionally exclude fetch functions to prevent re-renders
  ])

  useEffect(() => {
    // Only run once when auth is ready
    if (authInitialized && user && !hasRunRef.current && !isRunningRef.current) {
      preloadData()
    }
  }, [authInitialized, user, preloadData])

  return {
    isLoading,
    isReady,
    error,
    loadingMessage,
    preloadData
  }
}

/**
 * Specialized hooks for common page types
 */

export function useWorkflowsPagePreloader() {
  return usePageDataPreloader("workflows")
}

export function useAIAssistantPagePreloader() {
  return usePageDataPreloader("ai-assistant")
}

export function useSettingsPagePreloader() {
  return usePageDataPreloader("settings")
}

export function useTemplatesPagePreloader() {
  return usePageDataPreloader("templates")
}

export function useAnalyticsPagePreloader() {
  return usePageDataPreloader("analytics")
}

export function useTeamsPagePreloader() {
  return usePageDataPreloader("teams")
}

export function useAppsPagePreloader() {
  return usePageDataPreloader("apps", {
    skipWorkflows: true // Apps page doesn't need workflows
  })
}
