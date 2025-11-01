import { create } from "zustand"
import { getSupabaseClient } from "@/lib/supabase"
import { apiClient } from "@/lib/apiClient"
import { SessionManager } from "@/lib/auth/session"
import { OAuthPopupManager } from "@/lib/oauth/popup-manager"
import { IntegrationService, Provider } from "@/services/integration-service"
import { ScopeValidator } from "@/lib/integrations/scope-validator"
import { OAuthConnectionFlow } from "@/lib/oauth/connection-flow"
import { useWorkflowStore } from "./workflowStore"

import { logger } from '@/lib/utils/logger'

// Track ongoing requests for cleanup
let currentAbortController: AbortController | null = null
let ongoingFetchPromise: Promise<void> | null = null


// This represents the structure of a connected integration
export interface Integration {
  id: string
  user_id: string
  provider: string
  status: string
  access_token?: string
  refresh_token?: string
  created_at: string
  updated_at: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
  disconnected_at?: string | null
  disconnect_reason?: string | null
  // Workspace context fields
  workspace_type?: 'personal' | 'team' | 'organization'
  workspace_id?: string | null
  connected_by?: string
  // Permission level for current user
  user_permission?: 'use' | 'manage' | 'admin' | null
  [key: string]: any
}


export interface IntegrationStore {
  integrations: Integration[]
  integrationData: Record<string, any>
  providers: Provider[]
  loading: boolean
  error: string | null
  loadingStates: Record<string, boolean>
  debugInfo: any
  globalPreloadingData: boolean
  preloadStarted: boolean
  apiKeyIntegrations: Integration[]
  currentUserId: string | null
  lastFetchTime: number | null
  // Workspace context
  workspaceType: 'personal' | 'team' | 'organization'
  workspaceId: string | null

  // Actions
  setLoading: (key: string, loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
  initializeProviders: () => Promise<void>
  fetchIntegrations: (force?: boolean, workspaceType?: 'personal' | 'team' | 'organization', workspaceId?: string) => Promise<void>
  connectIntegration: (providerId: string) => Promise<void>
  disconnectIntegration: (integrationId: string) => Promise<void>
  refreshAllTokens: () => Promise<{ refreshed: number; failed: number }>
  getIntegrationStatus: (providerId: string) => string
  getIntegrationByProvider: (providerId: string) => Integration | null
  getConnectedProviders: () => string[]
  initializeGlobalPreload: () => Promise<void>
  loadIntegrationData: (
    dataType: string,
    integrationId: string,
    params?: Record<string, any>,
    forceRefresh?: boolean
  ) => Promise<any>
  clearAllData: () => void
  connectApiKeyIntegration: (providerId: string, apiKey: string) => Promise<void>
  reconnectIntegration: (integrationId: string) => Promise<void>
  deleteIntegration: (integrationId: string) => Promise<void>
  setCurrentUserId: (userId: string | null) => void
  setWorkspaceContext: (workspaceType: 'personal' | 'team' | 'organization', workspaceId?: string | null) => void
  checkIntegrationScopes: (providerId: string) => { needsReconnection: boolean; reason: string; missingScopes?: string[] }
}

// Custom event system for integration changes
const INTEGRATION_EVENTS = {
  INTEGRATION_CONNECTED: 'integration-connected',
  INTEGRATION_DISCONNECTED: 'integration-disconnected',
  INTEGRATION_RECONNECTED: 'integration-reconnected',
  INTEGRATIONS_UPDATED: 'integrations-updated'
} as const

function emitIntegrationEvent(eventType: keyof typeof INTEGRATION_EVENTS, data?: any) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(INTEGRATION_EVENTS[eventType], { detail: data }))
  }
}

export const useIntegrationStore = create<IntegrationStore>()(
  (set, get) => {
    const normalizeProviderId = (integration: any) =>
      integration?.provider || integration?.id || integration?.provider_id

    const mapIntegrationStatus = (integration: any) =>
      integration?.status || (integration?.isConnected ? "connected" : "disconnected")

    const handleIntegrationStatusChanges = (
      previousIntegrations: any[] = [],
      nextIntegrations: any[] = []
    ) => {
      const previousStatusMap = new Map<string, string>(
        previousIntegrations.map((integration) => [
          normalizeProviderId(integration),
          mapIntegrationStatus(integration)
        ])
      )

      nextIntegrations.forEach((integration) => {
        const providerId = normalizeProviderId(integration)
        if (!providerId) return

        const currentStatus = mapIntegrationStatus(integration)
        const previousStatus = previousStatusMap.get(providerId)
        if (previousStatus === currentStatus) return

        if (currentStatus === "connected") {
          useWorkflowStore.getState().resumeWorkflowsForIntegration(providerId)
        } else if ([
          "disconnected",
          "needs_reauthorization",
          "unauthorized",
          "error",
        ].includes(currentStatus)) {
          useWorkflowStore.getState().pauseWorkflowsForIntegration(providerId)
        }
      })
    }

    return {
    providers: [],
    integrations: [],
    integrationData: {},
    apiKeyIntegrations: [],
    loading: false,
    loadingStates: {},
    debugInfo: null,
    error: null,
    globalPreloadingData: false,
    preloadStarted: false,
    currentUserId: null,
    lastFetchTime: null,
    // Default to personal workspace
    workspaceType: 'personal',
    workspaceId: null,

    setCurrentUserId: (userId: string | null) => {
      const currentUserId = get().currentUserId
      if (currentUserId !== userId) {
        if (userId) {
          set({ currentUserId: userId })
        } else {
          set({ currentUserId: null })
          get().clearAllData()
        }
      }
    },

    setWorkspaceContext: (workspaceType: 'personal' | 'team' | 'organization', workspaceId?: string | null) => {
      set({ workspaceType, workspaceId: workspaceId || null })
      // Refetch integrations when workspace context changes
      get().fetchIntegrations(true, workspaceType, workspaceId || undefined)
    },

    setLoading: (key: string, loading: boolean) => {
      set((state) => {
        const newLoadingStates = {
          ...state.loadingStates,
          [key]: loading,
        }
        
        // Calculate if anything is still loading
        const isAnythingLoading = Object.values(newLoadingStates).some(v => v === true)
        
        return {
          loadingStates: newLoadingStates,
          // Update main loading state based on any loading activity
          loading: key === "global" ? loading : isAnythingLoading,
        }
      })
    },

    setError: (error: string | null) => set({ error }),
    clearError: () => set({ error: null }),

    initializeProviders: async () => {
        const { setLoading } = get()

        // Timeout for production - 5 seconds
        const isProduction = process.env.NODE_ENV === 'production'
        const timeoutDuration = isProduction ? 5000 : 60000

        // Set a timeout to prevent stuck loading state
        const loadingTimeout = setTimeout(() => {
          const currentState = get()
          if (currentState.loadingStates['providers']) {
            logger.warn(`Provider initialization timeout after ${timeoutDuration}ms - resetting loading state`)
            setLoading('providers', false)
            // Set default providers if timeout occurs
            set({
              providers: [],
              error: null // Don't show error - just reset state
            })
          }
        }, timeoutDuration)

        try {
          setLoading('providers', true)
          set({ error: null })

          const providers = await IntegrationService.fetchProviders()

          clearTimeout(loadingTimeout)
          setLoading('providers', false)
          set({
            providers,
          })

        } catch (error: any) {
          logger.error("Failed to initialize providers:", error)
          clearTimeout(loadingTimeout)
          setLoading('providers', false)
          set({
            error: error.message || "Failed to load providers",
            providers: [],
          })
        }
    },

    fetchIntegrations: async (force = false, workspaceType?: 'personal' | 'team' | 'organization', workspaceId?: string) => {
      // If there's already an ongoing fetch, return that promise to prevent duplicate requests
      if (ongoingFetchPromise) {
        logger.debug('⏭️ [IntegrationStore] Fetch already in progress, returning existing promise')
        return ongoingFetchPromise
      }

      logger.debug('🔍 [IntegrationStore] fetchIntegrations called', {
        force,
        workspaceType,
        workspaceId,
        timestamp: new Date().toISOString()
      })
        const { setLoading, currentUserId, integrations, lastFetchTime } = get()

        // Use provided workspace context or fallback to store state
        const effectiveWorkspaceType = workspaceType || get().workspaceType
        const effectiveWorkspaceId = workspaceId || get().workspaceId || undefined

        // Reduced cache duration to 5 seconds (matching workflow store) - integrations change frequently
        const CACHE_DURATION = 5000 // 5 seconds (reduced from 60)
        if (!force && lastFetchTime && Date.now() - lastFetchTime < CACHE_DURATION) {
          logger.debug('[IntegrationStore] Using cached integrations (age: ' + Math.round((Date.now() - lastFetchTime) / 1000) + 's)')
          return integrations
        }

        // Abort any existing request
        if (currentAbortController) {
          currentAbortController.abort()
        }
        currentAbortController = new AbortController()

        // Create a promise that we'll track
        ongoingFetchPromise = (async () => {
          // Set timeout for fetch operation - increased to 60 seconds for slower connections
          const fetchTimeout = setTimeout(() => {
            logger.warn('Integration fetch timeout after 60s - aborting request')
            if (currentAbortController) {
              currentAbortController.abort()
            }
            setLoading('integrations', false)
            // Keep existing integrations if we have them, don't show error
            const existingIntegrations = get().integrations
            set({
              error: null, // Don't show error - just use cached data if available
              integrations: existingIntegrations || [] // Keep existing data
            })
            ongoingFetchPromise = null
          }, 60000) // 60 seconds for slower connections/large datasets

          try {
            setLoading('integrations', true)
            set({ error: null })

          // Try to get user session, but handle auth failures gracefully
          let user;
          try {
            const sessionData = await SessionManager.getSecureUserAndSession();
            user = sessionData.user;
          } catch (authError: any) {
            logger.debug("User not authenticated, skipping integration fetch")
            // Clear loading state and return empty integrations for unauthenticated users
            setLoading('integrations', false)
            set({
              integrations: [],
              currentUserId: null,
              error: null, // Don't show error for auth issues, just return empty
            })
            return
          }

          // If currentUserId is not set, set it now
          if (!currentUserId) {
            set({ currentUserId: user.id })
          } else if (user?.id !== currentUserId) {
            logger.warn("User session mismatch detected")
            setLoading('integrations', false)
            set({
              integrations: [],
              currentUserId: user.id, // Update to new user ID
              error: null,
            })
            // Continue with new user instead of returning
          }

          const integrations = await IntegrationService.fetchIntegrations(force, effectiveWorkspaceType, effectiveWorkspaceId)

          // Clear timeout on successful fetch
          clearTimeout(fetchTimeout)

          // Debug log to see what we got from the API
          logger.debug('📦 [IntegrationStore] Fetched integrations:', {
            count: integrations?.length,
            firstFew: integrations?.slice(0, 3).map(i => ({
              provider: i.provider,
              status: i.status,
              id: i.id
            }))
          });

          setLoading('integrations', false)
          const previousIntegrations = get().integrations
          handleIntegrationStatusChanges(previousIntegrations, integrations)
          set({
            integrations,
            lastFetchTime: Date.now()
          })
          } catch (error: any) {
            clearTimeout(fetchTimeout)

            // Check if it was aborted
            if (error.name === 'AbortError') {
              logger.debug('Integration fetch was aborted (timeout or new request)')
              setLoading('integrations', false)
              return
            }

            logger.error("Failed to fetch integrations:", error)
            // Do NOT clear existing integrations on transient failure
            setLoading('integrations', false)
            set({
              error: error.message || "Failed to fetch integrations"
            })
          } finally {
            // Cleanup
            clearTimeout(fetchTimeout)
            currentAbortController = null
            ongoingFetchPromise = null
          }
        })()

        return ongoingFetchPromise
    },

    connectIntegration: async (providerId: string) => {
      const { setLoading, setError, fetchIntegrations, loadingStates, integrations } = get()
      
      // Check if this is a reconnection (integration exists but needs reauth)
      const existingIntegration = integrations.find(i => i.provider === providerId)
      const isReconnection = existingIntegration?.status === 'needs_reauthorization'
      
      // Ensure providers are loaded - force reload if empty
      let { providers } = get()
      if (!providers || providers.length === 0) {
        logger.debug('🔄 Providers not loaded, initializing...')
        try {
          // Directly fetch providers instead of using initializeProviders which might be blocked
          const freshProviders = await IntegrationService.fetchProviders()
          set({ providers: freshProviders })
          providers = freshProviders
          logger.debug('✅ Providers loaded:', providers.map(p => p.id))
        } catch (error) {
          logger.error('Failed to load providers:', error)
          // Continue anyway for known providers
        }
      }
      
      const provider = providers?.find((p) => p.id === providerId)

      if (!provider) {
        logger.warn(`Provider ${providerId} not found in providers list:`, providers?.map(p => p.id) || [])
        // For Discord and other known providers, proceed anyway
        const knownProviders = ['discord', 'gmail', 'notion', 'slack', 'trello', 'airtable', 'google-drive', 'google-sheets', 'google-calendar', 'google-docs', 'microsoft-outlook', 'microsoft-teams']
        if (knownProviders.includes(providerId)) {
          logger.debug(`📌 Proceeding with known provider: ${providerId}`)
        } else {
          // Don't throw error - just log and proceed
          logger.error(`Unknown provider ${providerId}, but proceeding anyway`)
        }
      }

      // Check if already loading to prevent duplicate requests
      if (loadingStates[`connect-${providerId}`]) {
        logger.warn(`⚠️ Already connecting to ${providerId}, ignoring duplicate request`)
        return
      }

      // Skip availability check for known providers or if provider not found
      if (provider && !provider.isAvailable) {
        logger.warn(`⚠️ ${provider.name} may not be fully configured, but proceeding with connection attempt`)
      }

      setLoading(`connect-${providerId}`, true)
      setError(null)

      // Add a timeout to prevent stuck state
      const connectionTimeout = setTimeout(() => {
        const currentLoadingState = get().loadingStates[`connect-${providerId}`]
        if (currentLoadingState) {
          logger.warn(`⚠️ Connection timeout for ${providerId}, resetting state`)
          setLoading(`connect-${providerId}`, false)
          setError("Connection timeout. Please try again.")
        }
      }, 45000) // 45 second timeout for the entire connection process

      try {
        let result

        if (isReconnection && existingIntegration) {
          // Use reconnection flow for existing integrations that need reauth
          logger.debug(`🔄 Starting reconnection flow for ${providerId}`)
          result = await OAuthConnectionFlow.startReconnection({
            integrationId: existingIntegration.id,
            integration: existingIntegration,
            onSuccess: () => {
              // Immediately update the existing integration to show as connected
              set((state) => {
                const updatedIntegrations = state.integrations.map(i =>
                  i.id === existingIntegration.id
                    ? { ...i, status: 'connected' as const, error_message: null, updated_at: new Date().toISOString() }
                    : i
                )
                handleIntegrationStatusChanges(state.integrations, updatedIntegrations)
                return { integrations: updatedIntegrations }
              })

              clearTimeout(connectionTimeout) // Clear timeout on successful reconnection
              setLoading(`connect-${providerId}`, false)
              emitIntegrationEvent('INTEGRATION_RECONNECTED', { providerId })

              // Fetch from server immediately to update UI with real data
              // Don't wait 1.5 seconds - user needs instant feedback
              fetchIntegrations(true).catch(error => {
                logger.error('Failed to refresh integrations after reconnect:', error)
              })
            },
            onError: (error) => {
              clearTimeout(connectionTimeout) // Clear timeout on error
              setError(error)
              setLoading(`connect-${providerId}`, false)
            },
            onCancel: () => {
              clearTimeout(connectionTimeout) // Clear timeout on cancellation
              setLoading(`connect-${providerId}`, false)
            }
          })
        } else {
          // Use normal connection flow for new integrations
          result = await OAuthConnectionFlow.startConnection({
            providerId,
            onSuccess: (data) => {
              // Immediately update the local state to show as connected
              set((state) => {
                const existingIndex = state.integrations.findIndex(i => i.provider === providerId)
                const newIntegration: Integration = {
                  id: data.integrationId || `temp-${providerId}-${Date.now()}`,
                  provider: providerId,
                  status: 'connected',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  expires_at: data.expiresAt || null,
                  user_id: state.currentUserId || '',
                  encrypted_data: null,
                  error_message: null,
                  name: provider?.name || providerId,
                  provider_user_id: data.userId || null,
                  provider_email: data.email || null,
                  provider_account_name: data.accountName || null,
                  scopes: data.scopes || null,
                  metadata: data.metadata || null
                }

                let newIntegrations = [...state.integrations]
                if (existingIndex >= 0) {
                  // Update existing integration
                  newIntegrations[existingIndex] = newIntegration
                } else {
                  // Add new integration
                  newIntegrations.push(newIntegration)
                }

                handleIntegrationStatusChanges(state.integrations, newIntegrations)
                return { integrations: newIntegrations }
              })

              setLoading(`connect-${providerId}`, false)
              emitIntegrationEvent('INTEGRATION_CONNECTED', { providerId })

              // Fetch from server immediately to update UI with real data
              // Don't wait 1.5 seconds - user needs instant feedback
              fetchIntegrations(true).catch(error => {
                logger.error('Failed to refresh integrations after connect:', error)
              })
            },
            onError: (error) => {
              clearTimeout(connectionTimeout) // Clear timeout on error
              setError(error)
              setLoading(`connect-${providerId}`, false)
            },
            onCancel: async () => {
              // For HubSpot, immediately check if connection actually succeeded
              // since the popup messaging sometimes fails
              if (providerId === 'hubspot') {
                try {
                  // Force fetch fresh data from database
                  const freshIntegrations = await IntegrationService.fetchIntegrations(true)
                  handleIntegrationStatusChanges(get().integrations, freshIntegrations)
                  set({ integrations: freshIntegrations })
                  const hubspotIntegration = freshIntegrations.find(i => i.provider === 'hubspot')
                  if (hubspotIntegration && hubspotIntegration.status === 'connected') {
                    // Connection succeeded! Update UI instantly
                    emitIntegrationEvent('INTEGRATION_CONNECTED', { providerId: 'hubspot' })
                    setLoading(`connect-${providerId}`, false)
                    return // Don't treat as cancellation
                  }
                } catch (error) {
                  logger.warn('Failed to check HubSpot connection status:', error)
                }
              }
              // Only set loading to false if not HubSpot or if HubSpot check failed
              setLoading(`connect-${providerId}`, false)
              // User cancelled - don't set error
            },
            onInfo: (message) => {
              setLoading(`connect-${providerId}`, false)
              // Don't set error for info messages (like permission issues)
            }
          })
        }

        if (result && !result.success) {
          throw new Error(result.message || "Connection failed")
        }
        // Clear the timeout on completion
        clearTimeout(connectionTimeout)
      } catch (error: any) {
        // Clear the timeout on error
        clearTimeout(connectionTimeout)
        const errorMessage = error?.message || "Connection failed"
        // Only set error if we have a provider name
        const providerName = provider?.name || providerId.charAt(0).toUpperCase() + providerId.slice(1)
        setError(`Failed to connect to ${providerName}: ${errorMessage}`)
        setLoading(`connect-${providerId}`, false)
      }
    },

    connectApiKeyIntegration: async (providerId: string, apiKey: string) => {
      const { setLoading, fetchIntegrations, setError } = get()
      setLoading(`connect-${providerId}`, true)
      setError(null)

      try {
        await IntegrationService.connectApiKeyIntegration(providerId, apiKey)
        
        setLoading(`connect-${providerId}`, false)
        setTimeout(() => {
          fetchIntegrations(true)
          emitIntegrationEvent('INTEGRATION_CONNECTED', { providerId })
        }, 1000)
      } catch (error: any) {
        logger.error("Error connecting API key integration:", error)
        setError(error.message || "Failed to connect integration")
        setLoading(`connect-${providerId}`, false)
      }
    },

    disconnectIntegration: async (integrationId: string) => {
      const { setLoading, fetchIntegrations, setError, integrations } = get()

      // Find the integration to get the provider name for proper loading state
      const integration = integrations.find(i => i.id === integrationId)
      const loadingKey = integration ? `disconnect-${integration.provider}` : `disconnect-${integrationId}`

      setLoading(loadingKey, true)
      setError(null)

      try {
        await IntegrationService.disconnectIntegration(integrationId)

        // Immediately remove the integration from the state for instant UI update
        set((state) => {
          const updatedIntegrations = state.integrations.filter(i => i.id !== integrationId)
          handleIntegrationStatusChanges(state.integrations, updatedIntegrations)
          return {
            integrations: updatedIntegrations
          }
        })

        // Emit event for other components to listen to
        emitIntegrationEvent('INTEGRATION_DISCONNECTED', { integrationId })

        setLoading(loadingKey, false)
        
        // Fetch integrations after a short delay to ensure consistency with the backend
        setTimeout(() => {
          fetchIntegrations(true)
        }, 500)
      } catch (error: any) {
        logger.error("Error disconnecting integration:", error)
        setError(error.message || "Failed to disconnect integration")
        setLoading(loadingKey, false)
        // Refresh integrations on error to ensure UI stays in sync
        setTimeout(() => {
          fetchIntegrations(true)
        }, 100)
      }
    },

    refreshAllTokens: async () => {
      const { setLoading, setError, fetchIntegrations } = get()
      setLoading("refresh-all", true)
      setError(null)

      try {
        const stats = await IntegrationService.refreshTokens()
        
        setLoading("refresh-all", false)
        setTimeout(() => {
          fetchIntegrations(true)
        }, 1000)
        
        return stats
      } catch (error: any) {
        logger.error("Error refreshing tokens:", error)
        setError(error.message || "Failed to refresh tokens")
        setLoading("refresh-all", false)
        return { refreshed: 0, failed: 0 }
      }
    },

    loadIntegrationData: async (dataType, integrationId, params, forceRefresh = false) => {
      try {
        // Create new request
        logger.debug(`🚀 [IntegrationStore] Starting new request:`, {
          dataType,
          integrationId,
          params,
          forceRefresh,
          message: `Calling IntegrationService.loadIntegrationData with dataType: ${dataType}`
        })
        const result = await IntegrationService.loadIntegrationData(dataType, integrationId, params, forceRefresh)
        return result
      } catch (error: any) {
        logger.error("Error loading integration data:", error)
        throw error
      }
    },

    reconnectIntegration: async (integrationId: string) => {
      const { setLoading, fetchIntegrations, integrations, setError } = get()
      const integration = integrations.find((i) => i.id === integrationId)

      if (!integration) {
        logger.error("❌ Integration not found for ID:", integrationId)
        return
      }

      setLoading(`reconnect-${integrationId}`, true)
      setError(null)

      try {
        const result = await OAuthConnectionFlow.startReconnection({
          integrationId,
          integration,
          onSuccess: () => {
            // Immediately update the integration to show as connected
            set((state) => {
              const updatedIntegrations = state.integrations.map(i =>
                i.id === integrationId
                  ? { ...i, status: 'connected' as const, error_message: null, updated_at: new Date().toISOString() }
                  : i
              )
              handleIntegrationStatusChanges(state.integrations, updatedIntegrations)
              return { integrations: updatedIntegrations }
            })

            void IntegrationService.clearIntegrationReconnect(integrationId)

            setLoading(`reconnect-${integrationId}`, false)
            emitIntegrationEvent('INTEGRATION_RECONNECTED', { integrationId, provider: integration.provider })

            // Fetch from server immediately to update UI with real data
            // Don't wait 1.5 seconds - user needs instant feedback
            fetchIntegrations(true).catch(error => {
              logger.error('Failed to refresh integrations after reconnect:', error)
            })
          },
          onError: (error) => {
            setError(error)
            setLoading(`reconnect-${integrationId}`, false)
          },
          onCancel: () => {
            setLoading(`reconnect-${integrationId}`, false)
          }
        })

        if (!result.success) {
          throw new Error(result.message || "Reconnection failed")
        }
      } catch (error: any) {
        logger.error(`❌ Failed to reconnect ${integration.provider}:`, error)
        setError(error.message)
        setLoading(`reconnect-${integrationId}`, false)
      }
    },


    getIntegrationStatus: (providerId: string) => {
      const { integrations } = get()
      
      const integration = integrations.find((i) => i.provider === providerId)
      return integration?.status || "disconnected"
    },

    getIntegrationByProvider: (providerId: string) => {
      const { integrations } = get()
      
      // For Google services, they might all be under a single 'google' integration
      // Map specific Google service providers to the base 'google' provider
      const providerMapping: Record<string, string> = {
        'google-docs': 'google',
        'google-drive': 'google',
        'google-sheets': 'google',
        'google-calendar': 'google',
        'google_calendar': 'google',  // Also handle underscore variant
      }
      
      // Check if we need to map the provider
      const actualProvider = providerMapping[providerId] || providerId
      
      // First try exact match
      let integration = integrations.find((i) => i.provider === providerId)

      // If not found and we have a mapping, try the mapped provider
      if (!integration && actualProvider !== providerId) {
        integration = integrations.find((i) => i.provider === actualProvider)
      }

      // Additional fallback: try with underscore if hyphen fails (or vice versa)
      if (!integration) {
        const alternateProvider = providerId.includes('-')
          ? providerId.replace(/-/g, '_')
          : providerId.replace(/_/g, '-')
        integration = integrations.find((i) => i.provider === alternateProvider)
      }

      // Final fallback: for any Google service, try to find 'google' or 'google_calendar'
      if (!integration && (providerId.includes('google') || providerId === 'gmail')) {
        integration = integrations.find((i) =>
          i.provider === 'google' ||
          i.provider === 'google_calendar' ||
          i.provider === 'gmail'
        )
      }

      return integration || null
    },

    getConnectedProviders: () => {
      const { integrations } = get()

      const isConnectedStatus = (status?: string) => {
        const v = (status || '').toLowerCase()
        return v === 'connected' || v === 'authorized' || v === 'active' || v === 'valid' || v === 'ok' || v === 'ready'
      }

      // Debug log (commented out to reduce console noise)
      // logger.debug('🔍 [getConnectedProviders] Checking integrations:', {
      //   totalIntegrations: integrations.length,
      //   integrations: integrations.map(i => ({
      //     provider: i.provider,
      //     status: i.status,
      //     isConnected: isConnectedStatus(i.status)
      //   }))
      // })

      // Return all integrations that are connected (status === "connected")
      // Other statuses like expired or needs_reauthorization should show as disconnected
      const connectedProviders = integrations
        .filter((i) => isConnectedStatus(i.status))
        .map((i) => i.provider)
      
      // Google services share authentication - if any Google service is connected, all are available
      const googleServices = ['google-drive', 'google-sheets', 'google-docs', 'google-calendar', 'google_calendar', 'gmail']
      const hasAnyGoogleService = connectedProviders.some(provider =>
        googleServices.includes(provider) || provider === 'google'
      )
      
      if (hasAnyGoogleService) {
        // Add all Google service IDs since they share authentication
        googleServices.forEach(service => {
          if (!connectedProviders.includes(service)) {
            connectedProviders.push(service)
          }
        })
      }
      
      // Microsoft services DO NOT share authentication - each requires separate connection
      // Unlike Google services, Microsoft services (OneNote, Outlook, Teams, OneDrive) each need
      // their own OAuth connection and should not be considered connected just because one is connected

      // logger.debug('🔍 [getConnectedProviders] Final result:', connectedProviders)
      return connectedProviders
    },

    initializeGlobalPreload: async () => {
      const { initializeProviders, fetchIntegrations, preloadStarted } = get()
      if (preloadStarted) return
      set({ globalPreloadingData: true, preloadStarted: true })

      try {
        await Promise.all([
          initializeProviders(),
          fetchIntegrations()
        ])
      } catch (error) {
        logger.error("Error during global preload:", error)
        get().setError("Failed to load initial data.")
      } finally {
        set({ globalPreloadingData: false })
      }
    },

    clearAllData: () => {
      // Cancel any ongoing requests
      if (currentAbortController) {
        try {
          currentAbortController.abort('Store cleared')
          currentAbortController = null
        } catch (error) {
          logger.warn('Failed to abort request during clear:', error)
        }
      }

      set({
        integrations: [],
        providers: [],
        integrationData: {},
        loading: false,
        error: null,
        loadingStates: {},
        debugInfo: {},
        globalPreloadingData: false,
        preloadStarted: false,
        apiKeyIntegrations: []
      })
    },

    deleteIntegration: async (integrationId: string) => {
      const { setLoading, integrations, fetchIntegrations, setError } = get()
      const integration = integrations.find((i) => i.id === integrationId)
      if (!integration) return

      setLoading(`delete-${integration.provider}`, true)
      setError(null)

      try {
        await IntegrationService.disconnectIntegration(integrationId)
        
        // Immediately remove the integration from the state for instant UI update
        set((state) => {
          const updatedIntegrations = state.integrations.filter(i => i.id !== integrationId)
          handleIntegrationStatusChanges(state.integrations, updatedIntegrations)
          return {
            integrations: updatedIntegrations
          }
        })
        
        // Emit event for other components to listen to
        emitIntegrationEvent('INTEGRATION_DISCONNECTED', { integrationId })
        
        // Fetch integrations to ensure consistency with the backend
        setTimeout(() => {
          fetchIntegrations(true)
        }, 500)
      } catch (error: any) {
        setError(error.message)
        // Refresh integrations on error to ensure UI stays in sync
        setTimeout(() => {
          fetchIntegrations(true)
        }, 100)
      } finally {
        setLoading(`delete-${integration.provider}`, false)
      }
    },

    // Helper function to check if integration needs reconnection due to missing scopes
    checkIntegrationScopes: (providerId: string) => {
      const { integrations } = get()
      const integration = integrations.find(i => i.provider === providerId)
      
      if (!integration || integration.status !== "connected") {
        return { needsReconnection: false, reason: "Integration not connected" }
      }

      const grantedScopes = integration.scopes || []
      
      // Check for Google Docs specific scope requirements
      if (providerId === "google-docs") {
        const requiredScopes = [
          "https://www.googleapis.com/auth/documents",
          "https://www.googleapis.com/auth/drive.readonly"
        ]
        
        const missingScopes = requiredScopes.filter(scope => !grantedScopes.includes(scope))
        
        if (missingScopes.length > 0) {
          logger.warn(`❌ Missing scopes for ${providerId}:`, missingScopes)
          return {
            needsReconnection: true,
            reason: `Missing required scopes: ${missingScopes.join(", ")}`,
            missingScopes
          }
        }
      }
      
      // Check for Teams specific scope requirements
      if (providerId === "teams") {
        // Define both fully qualified and short-form scopes
        const requiredScopes = [
          "https://graph.microsoft.com/User.Read",
          "https://graph.microsoft.com/Team.ReadBasic.All", 
          "https://graph.microsoft.com/Channel.ReadBasic.All",
          "https://graph.microsoft.com/Chat.Read",
          "https://graph.microsoft.com/ChatMessage.Send",
          "https://graph.microsoft.com/OnlineMeetings.ReadWrite"
        ]
        
        const shortFormScopes = [
          "User.Read",
          "Team.ReadBasic.All", 
          "Channel.ReadBasic.All",
          "Chat.Read",
          "ChatMessage.Send",
          "OnlineMeetings.ReadWrite"
        ]
        
        // Check if each required scope is present in either fully qualified or short form
        const missingScopes = requiredScopes.filter((scope, index) => {
          const shortForm = shortFormScopes[index]
          return !grantedScopes.includes(scope) && !grantedScopes.includes(shortForm)
        })
        
        if (missingScopes.length > 0) {
          logger.warn(`❌ Missing scopes for ${providerId}:`, missingScopes)
          return {
            needsReconnection: true,
            reason: `Teams integration requires additional permissions. Please reconnect your account to grant the necessary access.`,
            missingScopes
          }
        }
      }
      
      // Check for Outlook specific scope requirements
      if (providerId === "microsoft-outlook") {
        const requiredScopes = [
          "https://graph.microsoft.com/User.Read",
          "https://graph.microsoft.com/Mail.ReadWrite",
          "https://graph.microsoft.com/Mail.Send",
          "https://graph.microsoft.com/Calendars.ReadWrite",
          "https://graph.microsoft.com/Contacts.ReadWrite"
        ]
        
        const shortFormScopes = [
          "User.Read",
          "Mail.ReadWrite",
          "Mail.Send",
          "Calendars.ReadWrite",
          "Contacts.ReadWrite"
        ]
        
        // Check if each required scope is present in either fully qualified or short form
        const missingScopes = requiredScopes.filter((scope, index) => {
          const shortForm = shortFormScopes[index]
          return !grantedScopes.includes(scope) && !grantedScopes.includes(shortForm)
        })
        
        if (missingScopes.length > 0) {
          logger.warn(`❌ Missing scopes for ${providerId}:`, missingScopes)
          return {
            needsReconnection: true,
            reason: `Outlook integration requires additional permissions for full functionality. Please reconnect your account to grant access to emails, calendars, and contacts.`,
            missingScopes
          }
        }
      }
      
      // Check for OneDrive specific scope requirements
      if (providerId === "onedrive") {
        const requiredScopes = [
          "https://graph.microsoft.com/User.Read",
          "https://graph.microsoft.com/Files.ReadWrite.All"
        ]
        
        const shortFormScopes = [
          "User.Read",
          "Files.ReadWrite.All"
        ]
        
        // Check if each required scope is present in either fully qualified or short form
        const missingScopes = requiredScopes.filter((scope, index) => {
          const shortForm = shortFormScopes[index]
          return !grantedScopes.includes(scope) && !grantedScopes.includes(shortForm)
        })
        
        if (missingScopes.length > 0) {
          logger.warn(`❌ Missing scopes for ${providerId}:`, missingScopes)
          return {
            needsReconnection: true,
            reason: `OneDrive integration requires additional permissions. Please reconnect your account to grant the necessary access.`,
            missingScopes
          }
        }
      }
      
      // Check for OneNote specific scope requirements
      if (providerId === "microsoft-onenote") {
        const requiredScopes = [
          "https://graph.microsoft.com/User.Read",
          "https://graph.microsoft.com/Notes.ReadWrite.All",
          "https://graph.microsoft.com/Files.Read"
        ]
        
        const shortFormScopes = [
          "User.Read",
          "Notes.ReadWrite.All",
          "Files.Read"
        ]
        
        // Check if each required scope is present in either fully qualified or short form
        const missingScopes = requiredScopes.filter((scope, index) => {
          const shortForm = shortFormScopes[index]
          return !grantedScopes.includes(scope) && !grantedScopes.includes(shortForm)
        })
        
        if (missingScopes.length > 0) {
          logger.warn(`❌ Missing scopes for ${providerId}:`, missingScopes)
          return {
            needsReconnection: true,
            reason: `OneNote integration requires additional permissions. Please reconnect your account to grant the necessary access.`,
            missingScopes
          }
        }
      }
      
      return { needsReconnection: false, reason: "All required scopes present" }
    },
  }
})
