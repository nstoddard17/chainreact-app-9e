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
  // Use ref instead of state to prevent re-renders
  const hasRunRef = useRef(false)
  const isRunningRef = useRef(false)

  const { fetchWorkflows } = useWorkflowStore()
  const { user, initialized: authInitialized } = useAuthStore()
  const { fetchIntegrations } = useIntegrationStore()
  const { fetchOrganizations } = useOrganizationStore()

  // Check if we have cached data IMMEDIATELY to avoid flash of loading screen
  const hasCachedData = useCallback(() => {
    const workflowStore = useWorkflowStore.getState()
    const integrationStore = useIntegrationStore.getState()
    const now = Date.now()
    const CACHE_THRESHOLD = 30000

    const hasWorkflows = options.skipWorkflows ||
      !["workflows", "templates", "analytics"].includes(pageType) ||
      (workflowStore.workflows && workflowStore.workflows.length > 0) ||
      (workflowStore.lastFetchTime && (now - workflowStore.lastFetchTime) < CACHE_THRESHOLD)

    const hasIntegrations = options.skipIntegrations ||
      (integrationStore.lastFetchTime && (now - integrationStore.lastFetchTime) < CACHE_THRESHOLD)

    return hasWorkflows && hasIntegrations
  }, [pageType, options.skipWorkflows, options.skipIntegrations])

  // Initialize state based on cache - prevents loading screen flash
  const [isLoading, setIsLoading] = useState(() => !hasCachedData())
  const [isReady, setIsReady] = useState(() => hasCachedData())
  const [error, setError] = useState<Error | null>(null)
  const [loadingMessage, setLoadingMessage] = useState("Initializing...")

  // Helper to check if data is fresh in store
  const shouldSkipLoad = useCallback((loaderName: string): boolean => {
    const now = Date.now()
    const CACHE_THRESHOLD = 30000 // 30 seconds - increased for faster back navigation

    if (loaderName === 'integrations') {
      const integrationStore = useIntegrationStore.getState()
      if (integrationStore.lastFetchTime && (now - integrationStore.lastFetchTime) < CACHE_THRESHOLD) {
        logger.debug('usePageDataPreloader', 'Skipping integrations load - data is fresh')
        return true
      }
    }

    if (loaderName === 'workflows') {
      const workflowStore = useWorkflowStore.getState()
      // Skip if we have fresh data OR if we have workflows in the store already
      if (workflowStore.lastFetchTime && (now - workflowStore.lastFetchTime) < CACHE_THRESHOLD) {
        logger.debug('usePageDataPreloader', 'Skipping workflows load - data is fresh')
        return true
      }
      // Also skip if we have workflows in the store (user just came from builder)
      if (workflowStore.workflows && workflowStore.workflows.length > 0) {
        logger.debug('usePageDataPreloader', 'Skipping workflows load - workflows already in store')
        return true
      }
    }

    return false
  }, [])

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

    // CRITICAL: Check cache IMMEDIATELY before setting isRunningRef
    // This prevents the loading screen from showing when we have cached data
    const hasWorkflowCache = options.skipWorkflows || !["workflows", "templates", "analytics"].includes(pageType) || shouldSkipLoad('workflows')
    const hasIntegrationCache = options.skipIntegrations || shouldSkipLoad('integrations')

    if (hasWorkflowCache && hasIntegrationCache) {
      logger.info('usePageDataPreloader', `All data cached for ${pageType} - showing page immediately!`)
      hasRunRef.current = true
      setIsReady(true)
      setIsLoading(false)
      return
    }

    isRunningRef.current = true

    setIsLoading(true)
    setError(null)

    // Add overall timeout - if we're still loading after 30 seconds, show the page anyway
    const overallTimeout = setTimeout(() => {
      logger.warn('usePageDataPreloader', `Overall timeout reached for ${pageType} - showing page anyway`)
      hasRunRef.current = true
      isRunningRef.current = false
      setIsReady(true)
      setIsLoading(false)
    }, 30000) // 30 seconds total max

    // Keep trying until all data loads successfully (reduced retry count)
    let retryCount = 0
    const maxRetries = 3 // Reduced from 50 to 3 - if it fails 3 times, show the page anyway
    let success = false

    while (!success && retryCount < maxRetries) {
      try {
        const loaders: Array<{ name: string; loader: () => Promise<void> }> = []

        // Always load integrations unless explicitly skipped or data is fresh
        if (!options.skipIntegrations && !shouldSkipLoad('integrations')) {
          loaders.push({
            name: "integrations",
            loader: async () => {
              setLoadingMessage("Loading connected apps...")
              await fetchIntegrations()
            }
          })
        }

        // Load workflows for relevant pages (unless data is fresh)
        if (!options.skipWorkflows && ["workflows", "templates", "analytics"].includes(pageType) && !shouldSkipLoad('workflows')) {
          loaders.push({
            name: "workflows",
            loader: async () => {
              setLoadingMessage("Loading your workflows...")
              // Force fresh fetch on first load to prevent stale data flash
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

        // Execute all loaders in PARALLEL for faster loading
        // Using Promise.allSettled to allow partial success
        logger.info('usePageDataPreloader', `Loading ${loaders.length} data sources in parallel for ${pageType}`)

        const results = await Promise.allSettled(
          loaders.map(({ name, loader }) => {
            logger.info('usePageDataPreloader', `Starting ${name} for ${pageType}`)
            const startTime = Date.now()
            return loader()
              .then(() => {
                const duration = Date.now() - startTime
                logger.info('usePageDataPreloader', `✅ ${name} completed in ${duration}ms`)
              })
              .catch((loaderError: any) => {
                const duration = Date.now() - startTime
                // Log error but don't reject - allow other loaders to continue
                if (loaderError?.message?.includes('timeout') || loaderError?.message?.includes('aborted')) {
                  logger.warn('usePageDataPreloader', `⏱️ ${name} timed out after ${duration}ms - continuing with cached data`, loaderError)
                } else {
                  logger.error('usePageDataPreloader', `❌ ${name} failed after ${duration}ms - continuing`, loaderError)
                }
                // Return null to indicate this loader failed gracefully
                return null
              })
          })
        )

        // Log results
        const failures = results.filter(r => r.status === 'rejected')
        const successes = results.filter(r => r.status === 'fulfilled')
        logger.info('usePageDataPreloader', `Parallel loading complete: ${successes.length} succeeded, ${failures.length} failed`)

        setLoadingMessage("Finalizing...")
        // REMOVED: Artificial 150ms delay that was slowing down page transitions
        // State updates are processed synchronously, no delay needed

        // All loaders succeeded (or failed gracefully)!
        success = true
        hasRunRef.current = true // Mark as completed
        isRunningRef.current = false
        setIsReady(true)
        logger.info('usePageDataPreloader', `Page data preload complete for ${pageType}`)
      } catch (err) {
        retryCount++
        const error = err instanceof Error ? err : new Error('Failed to load page data')
        logger.warn('usePageDataPreloader', `Failed to preload data for ${pageType}, retrying... (attempt ${retryCount}/${maxRetries})`, error)
        setError(error)

        // If we've hit max retries, just show the page anyway
        if (retryCount >= maxRetries) {
          logger.warn('usePageDataPreloader', `Max retries reached for ${pageType}, showing page anyway`)
          clearTimeout(overallTimeout) // Clear timeout before exiting
          success = true // Force success to exit loop
          hasRunRef.current = true
          isRunningRef.current = false
          setIsReady(true)
          break
        }

        // Wait before retrying (exponential backoff)
        const delayMs = Math.min(1000 * Math.pow(2, retryCount - 1), 3000) // Cap at 3 seconds
        setLoadingMessage(`Connection issue detected. Retrying in ${Math.ceil(delayMs / 1000)}s...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }

    // Clear the overall timeout
    clearTimeout(overallTimeout)

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
    // Only run once when auth is ready AND we don't have cached data
    if (authInitialized && user && !hasRunRef.current && !isRunningRef.current && !isReady) {
      preloadData()
    } else if (isReady && !hasRunRef.current) {
      // Mark as run if we started with cached data
      hasRunRef.current = true
    }
  }, [authInitialized, user, preloadData, isReady])

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
