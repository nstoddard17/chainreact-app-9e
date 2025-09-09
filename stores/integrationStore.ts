import { create } from "zustand"
import { getSupabaseClient } from "@/lib/supabase"
import { apiClient } from "@/lib/apiClient"
import { loadDiscordGuildsOnce } from "./discordGuildsCacheStore"
import { SessionManager } from "@/lib/auth/session"
import { OAuthPopupManager } from "@/lib/oauth/popup-manager"
import { IntegrationService, Provider } from "@/services/integration-service"
import { ScopeValidator } from "@/lib/integrations/scope-validator"
import { OAuthConnectionFlow } from "@/lib/oauth/connection-flow"

// Track ongoing requests for cleanup
let currentAbortController: AbortController | null = null

// Global cache for ongoing requests to prevent duplicate API calls
const ongoingRequests = new Map<string, Promise<any>>()


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
  lastRefreshTime: string | null
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
  lastRefreshTime: string | null

  // Actions
  setLoading: (key: string, loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
  initializeProviders: () => Promise<void>
  fetchIntegrations: (force?: boolean) => Promise<void>
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
  (set, get) => ({
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
    lastRefreshTime: null,

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

    setLoading: (key: string, loading: boolean) => {
      set((state) => ({
        loadingStates: {
          ...state.loadingStates,
          [key]: loading,
        },
        // If setting global loading state, also update the main loading state
        ...(key === "global" && { loading }),
      }))
    },

    setError: (error: string | null) => set({ error }),
    clearError: () => set({ error: null }),

    initializeProviders: async () => {
      const { loading } = get()
      if (loading) {
        return
      }

      try {
        set({ loading: true, error: null })
        
        const providers = await IntegrationService.fetchProviders()

        set({
          providers,
          loading: false,
        })

      } catch (error: any) {
        console.error("Failed to initialize providers:", error)
        set({
          error: error.message || "Failed to load providers",
          loading: false,
          providers: [],
        })
      }
    },

    fetchIntegrations: async (force = false) => {
      const { loading, currentUserId } = get()
      if (loading && !force) {
        return
      }

      try {
        set({ loading: true, error: null })
        
        const { user } = await SessionManager.getSecureUserAndSession()

        // If currentUserId is not set, set it now
        if (!currentUserId) {
          set({ currentUserId: user.id })
        } else if (user?.id !== currentUserId) {
          set({
            integrations: [],
            loading: false,
            error: "User session mismatch",
          })
          return
        }

        const integrations = await IntegrationService.fetchIntegrations(force)
        
        set({
          integrations,
          loading: false,
          lastRefreshTime: new Date().toISOString(),
        })
      } catch (error: any) {
        console.error("Failed to fetch integrations:", error)
        set({
          error: error.message || "Failed to fetch integrations",
          loading: false,
          integrations: [],
        })
      }
    },

    connectIntegration: async (providerId: string) => {
      const { setLoading, setError, fetchIntegrations, loadingStates, integrations } = get()
      
      // Check if this is a reconnection (integration exists but needs reauth)
      const existingIntegration = integrations.find(i => i.provider === providerId)
      const isReconnection = existingIntegration?.status === 'needs_reauthorization'
      
      // Ensure providers are loaded - force reload if empty
      let { providers } = get()
      if (!providers || providers.length === 0) {
        console.log('🔄 Providers not loaded, initializing...')
        try {
          // Directly fetch providers instead of using initializeProviders which might be blocked
          const freshProviders = await IntegrationService.fetchProviders()
          set({ providers: freshProviders })
          providers = freshProviders
          console.log('✅ Providers loaded:', providers.map(p => p.id))
        } catch (error) {
          console.error('Failed to load providers:', error)
          // Continue anyway for known providers
        }
      }
      
      const provider = providers?.find((p) => p.id === providerId)

      if (!provider) {
        console.warn(`Provider ${providerId} not found in providers list:`, providers?.map(p => p.id) || [])
        // For Discord and other known providers, proceed anyway
        const knownProviders = ['discord', 'gmail', 'notion', 'slack', 'trello', 'airtable', 'google-drive', 'google-sheets', 'google-calendar', 'google-docs', 'microsoft-outlook', 'microsoft-teams']
        if (knownProviders.includes(providerId)) {
          console.log(`📌 Proceeding with known provider: ${providerId}`)
        } else {
          // Don't throw error - just log and proceed
          console.error(`Unknown provider ${providerId}, but proceeding anyway`)
        }
      }

      // Check if already loading to prevent duplicate requests
      if (loadingStates[`connect-${providerId}`]) {
        console.warn(`⚠️ Already connecting to ${providerId}, ignoring duplicate request`)
        return
      }

      // Skip availability check for known providers or if provider not found
      if (provider && !provider.isAvailable) {
        console.warn(`⚠️ ${provider.name} may not be fully configured, but proceeding with connection attempt`)
      }

      setLoading(`connect-${providerId}`, true)
      setError(null)

      try {
        let result
        
        if (isReconnection && existingIntegration) {
          // Use reconnection flow for existing integrations that need reauth
          console.log(`🔄 Starting reconnection flow for ${providerId}`)
          result = await OAuthConnectionFlow.startReconnection({
            integrationId: existingIntegration.id,
            integration: existingIntegration,
            onSuccess: () => {
              setLoading(`connect-${providerId}`, false)
              setTimeout(() => {
                fetchIntegrations(true) // Force refresh from server
                emitIntegrationEvent('INTEGRATION_RECONNECTED', { providerId })
              }, 1000)
            },
            onError: (error) => {
              setError(error)
              setLoading(`connect-${providerId}`, false)
            },
            onCancel: () => {
              setLoading(`connect-${providerId}`, false)
            }
          })
        } else {
          // Use normal connection flow for new integrations
          result = await OAuthConnectionFlow.startConnection({
            providerId,
            onSuccess: (data) => {
              setLoading(`connect-${providerId}`, false)
              setTimeout(() => {
                fetchIntegrations(true) // Force refresh from server
                emitIntegrationEvent('INTEGRATION_CONNECTED', { providerId })
              }, 1000)
            },
            onError: (error) => {
              setError(error)
              setLoading(`connect-${providerId}`, false)
            },
            onCancel: () => {
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
      } catch (error: any) {
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
        console.error("Error connecting API key integration:", error)
        setError(error.message || "Failed to connect integration")
        setLoading(`connect-${providerId}`, false)
      }
    },

    disconnectIntegration: async (integrationId: string) => {
      const { setLoading, fetchIntegrations, setError } = get()
      setLoading(`disconnect-${integrationId}`, true)
      setError(null)

      try {
        await IntegrationService.disconnectIntegration(integrationId)
        
        setLoading(`disconnect-${integrationId}`, false)
        setTimeout(() => {
          fetchIntegrations(true)
        }, 1000)
      } catch (error: any) {
        console.error("Error disconnecting integration:", error)
        setError(error.message || "Failed to disconnect integration")
        setLoading(`disconnect-${integrationId}`, false)
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
        console.error("Error refreshing tokens:", error)
        setError(error.message || "Failed to refresh tokens")
        setLoading("refresh-all", false)
        return { refreshed: 0, failed: 0 }
      }
    },

    loadIntegrationData: async (dataType, integrationId, params, forceRefresh = false) => {
      try {
        // Create a cache key for this specific request
        const cacheKey = `${dataType}-${integrationId}-${JSON.stringify(params || {})}`
        
        // If not forcing refresh and we have an ongoing request, return that promise
        if (!forceRefresh && ongoingRequests.has(cacheKey)) {
          console.log(`🔄 [IntegrationStore] Using ongoing request for ${dataType}`)
          return await ongoingRequests.get(cacheKey)!
        }
        
        // Create new request
        console.log(`🚀 [IntegrationStore] Starting new request:`, {
          dataType,
          integrationId, 
          params,
          forceRefresh,
          message: `Calling IntegrationService.loadIntegrationData with dataType: ${dataType}`
        })
        const requestPromise = IntegrationService.loadIntegrationData(dataType, integrationId, params, forceRefresh)
        
        // Store the promise to prevent duplicate calls
        ongoingRequests.set(cacheKey, requestPromise)
        
        try {
          const result = await requestPromise
          return result
        } finally {
          // Clean up the ongoing request when done
          ongoingRequests.delete(cacheKey)
        }
      } catch (error: any) {
        console.error("Error loading integration data:", error)
        throw error
      }
    },

    reconnectIntegration: async (integrationId: string) => {
      const { setLoading, fetchIntegrations, integrations, setError } = get()
      const integration = integrations.find((i) => i.id === integrationId)
      
      if (!integration) {
        console.error("❌ Integration not found for ID:", integrationId)
        return
      }
      
      setLoading(`reconnect-${integrationId}`, true)
      setError(null)

      try {
        const result = await OAuthConnectionFlow.startReconnection({
          integrationId,
          integration,
          onSuccess: () => {
            setLoading(`reconnect-${integrationId}`, false)
            setTimeout(() => {
              fetchIntegrations(true)
              emitIntegrationEvent('INTEGRATION_RECONNECTED', { integrationId, provider: integration.provider })
            }, 1000)
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
        console.error(`❌ Failed to reconnect ${integration.provider}:`, error)
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
      }
      
      // Check if we need to map the provider
      const actualProvider = providerMapping[providerId] || providerId
      
      // First try exact match
      let integration = integrations.find((i) => i.provider === providerId)
      
      // If not found and we have a mapping, try the mapped provider
      if (!integration && actualProvider !== providerId) {
        integration = integrations.find((i) => i.provider === actualProvider)
      }
      
      return integration || null
    },

    getConnectedProviders: () => {
      const { integrations } = get()
      
      // Return all integrations that exist and are usable (not just "connected" ones)
      // This includes connected, expired, needs_reauthorization, etc. since they can be reconnected
      // Only exclude explicitly disconnected or failed integrations
      const connectedProviders = integrations
        .filter((i) => i.status !== "disconnected" && i.status !== "failed" && !i.disconnected_at)
        .map((i) => i.provider)
      
      // Google services share authentication - if any Google service is connected, all are available
      const googleServices = ['google-drive', 'google-sheets', 'google-docs', 'google-calendar', 'gmail']
      const hasAnyGoogleService = connectedProviders.some(provider => googleServices.includes(provider))
      
      if (hasAnyGoogleService) {
        // Add all Google service IDs since they share authentication
        googleServices.forEach(service => {
          if (!connectedProviders.includes(service)) {
            connectedProviders.push(service)
          }
        })
      }
      
      return connectedProviders
    },

    initializeGlobalPreload: async () => {
      const { initializeProviders, fetchIntegrations, preloadStarted } = get()
      if (preloadStarted) return
      set({ globalPreloadingData: true, preloadStarted: true })

      try {
        await Promise.all([
          initializeProviders(), 
          fetchIntegrations(),
          // Prefetch Discord guilds if user has Discord connected
          loadDiscordGuildsOnce().catch(error => {
            // Silently fail if Discord is not connected - this is expected
          })
        ])
      } catch (error) {
        console.error("Error during global preload:", error)
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
          console.warn('Failed to abort request during clear:', error)
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
        apiKeyIntegrations: [],
        lastRefreshTime: null,
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
        await fetchIntegrations(true)
      } catch (error: any) {
        setError(error.message)
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
          console.warn(`❌ Missing scopes for ${providerId}:`, missingScopes)
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
          console.warn(`❌ Missing scopes for ${providerId}:`, missingScopes)
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
          console.warn(`❌ Missing scopes for ${providerId}:`, missingScopes)
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
          console.warn(`❌ Missing scopes for ${providerId}:`, missingScopes)
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
          console.warn(`❌ Missing scopes for ${providerId}:`, missingScopes)
          return {
            needsReconnection: true,
            reason: `OneNote integration requires additional permissions. Please reconnect your account to grant the necessary access.`,
            missingScopes
          }
        }
      }
      
      return { needsReconnection: false, reason: "All required scopes present" }
    },
  })
)
