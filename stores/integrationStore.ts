import { create } from "zustand"
import { getSupabaseClient } from "@/lib/supabase"
import { apiClient } from "@/lib/apiClient"
import { loadDiscordGuildsOnce } from "./discordGuildsCacheStore"

// Global variables for OAuth popup management
let currentOAuthPopup: Window | null = null
let windowHasLostFocus = false

// Track ongoing requests for cleanup
let currentAbortController: AbortController | null = null

// Helper function to check if popup is still valid
function isPopupValid(popup: Window | null): boolean {
  // COOP policy blocks window.closed checks, so we rely on message events and localStorage
  // Assume popup is valid if it exists
  return !!popup
}

// Helper function to close existing popup and reset state
function closeExistingPopup() {
  if (currentOAuthPopup) {
    try {
      currentOAuthPopup.close()
    } catch (e) {
      console.warn("Failed to close existing popup:", e)
    }
    currentOAuthPopup = null
  }
  windowHasLostFocus = false
}

// Helper function to securely get user and session data
async function getSecureUserAndSession() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error("Supabase client not available")
  }

  // First, validate the user securely
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user?.id) {
    // Try to refresh the session
    console.log("🔄 Attempting to refresh session...")
    const { data: { session }, error: refreshError } = await supabase.auth.refreshSession()
    
    if (refreshError || !session) {
      console.error("❌ Session refresh failed:", refreshError)
      throw new Error("No authenticated user found. Please log in again.")
    }
    
    // Try to get user again after refresh
    const { data: { user: refreshedUser }, error: refreshedUserError } = await supabase.auth.getUser()
    if (refreshedUserError || !refreshedUser?.id) {
      throw new Error("Session refresh failed. Please log in again.")
    }
    
    console.log("✅ Session refreshed successfully")
    return { user: refreshedUser, session }
  }

  // Then get the session for the access token
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    // Try to refresh the session if no access token
    console.log("🔄 No access token found, attempting to refresh session...")
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession()
    
    if (refreshError || !refreshedSession?.access_token) {
      throw new Error("Session expired. Please log in again.")
    }
    
    console.log("✅ Session refreshed successfully")
    return { user, session: refreshedSession }
  }

  return { user, session }
}

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

export interface Provider {
  id: string
  name: string
  description: string
  logoUrl?: string
  capabilities: string[]
  isAvailable: boolean
  category?: string
  authType?: "oauth" | "apiKey"
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
  refreshAllTokens: () => Promise<void>
  getIntegrationStatus: (providerId: string) => string
  getIntegrationByProvider: (providerId: string) => Integration | null
  getConnectedProviders: () => string[]
  initializeGlobalPreload: () => Promise<void>
  loadIntegrationData: (
    providerId: string,
    integrationId: string,
    params?: Record<string, any>,
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
      console.log("🚀 initializeProviders called", { loading })
      if (loading) {
        console.log("⏸️ Skipping initializeProviders - already loading")
        return
      }

      try {
        console.log("🔄 Starting initializeProviders API call")
        set({ loading: true, error: null })

        // Use direct fetch instead of apiClient for this public endpoint
        const fetchResponse = await fetch("/api/integrations/available")
        
        if (!fetchResponse.ok) {
          throw new Error(`HTTP ${fetchResponse.status}: Failed to fetch available integrations`)
        }

        const responseData = await fetchResponse.json()
        console.log("📡 Direct API response received:", { 
          success: responseData.success, 
          dataType: typeof responseData.data,
          hasDataIntegrations: !!responseData.data?.integrations,
          integrationsCount: responseData.data?.integrations?.length || 0
        })

        if (!responseData.success) {
          throw new Error(responseData.error || "Failed to fetch available integrations")
        }

        // Parse the providers from the API response structure
        const providers = responseData.data?.integrations || []

        console.log("🔧 InitializeProviders debug:", {
          responseSuccess: responseData.success,
          responseDataType: typeof responseData.data,
          isArray: Array.isArray(responseData.data),
          hasDataIntegrations: !!responseData.data?.integrations,
          providersCount: providers.length,
          firstProvider: providers[0]?.id
        })

        set({
          providers,
          loading: false,
        })

        console.log("✅ Providers initialized:", providers.length)
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
      console.log("🔄 fetchIntegrations called", { loading, force, currentUserId })
      
      if (loading && !force) {
        console.log("⏸️ Skipping fetch - already loading and not forced")
        return
      }

      console.log("🚀 Starting fetchIntegrations")
      set({ loading: true, error: null })

      let timeoutId: NodeJS.Timeout | null = null

      try {
        const { user, session } = await getSecureUserAndSession()

        // If currentUserId is not set, set it now
        if (!currentUserId) {
          console.log(`🔄 Setting current user ID from session`)
          set({ currentUserId: user.id })
        } else if (user?.id !== currentUserId) {
          console.log(`⚠️ User ID mismatch, clearing data`)
          set({
            integrations: [],
            loading: false,
            error: "User session mismatch",
          })
          return
        }

        // Cancel any ongoing request
        if (currentAbortController) {
          try {
            console.log("Aborting previous integrations request")
            currentAbortController.abort('New request started')
          } catch (error) {
            console.warn('Failed to abort previous request:', error)
          }
        }

        const controller = new AbortController()
        currentAbortController = controller
        
        timeoutId = setTimeout(() => {
          try {
            controller.abort('Request timeout')
          } catch (error) {
            console.warn('AbortController already aborted:', error)
          }
        }, 15000)

        const cacheBustingUrl = `/api/integrations?timestamp=${Date.now()}`

        const response = await fetch(cacheBustingUrl, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
          cache: 'no-store',
        })

        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        currentAbortController = null

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch integrations`)
        }

        const data = await response.json()

        const integrations = Array.isArray(data.data) ? data.data : data.integrations || []
        console.log("✅ fetchIntegrations completed", { count: integrations.length, integrations: integrations.map((i: any) => ({ provider: i.provider, status: i.status })) })
        
        // Check specifically for OneNote integration
        const oneNoteIntegration = integrations.find((i: any) => i.provider === "microsoft-onenote")
        if (oneNoteIntegration) {
          console.log("🔍 OneNote integration found:", { 
            id: oneNoteIntegration.id,
            status: oneNoteIntegration.status,
            updated_at: oneNoteIntegration.updated_at
          })
        } else {
          console.log("⚠️ No OneNote integration found in response")
        }
        
        set({
          integrations,
          loading: false,
          debugInfo: data.debug || {},
          lastRefreshTime: new Date().toISOString(),
        })
      } catch (error: any) {
        // Clean up timeout and abort controller in case of error
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        if (currentAbortController) {
          currentAbortController = null
        }
        
        // Silently ignore AbortError since it's an expected behavior
        // when multiple requests are made in quick succession
        if (error.name === "AbortError") {
          console.log("Fetch integrations request was aborted:", error.message)
          // Don't update error state for aborted requests
          set({ loading: false })
          return
        }
        
        console.error("Failed to fetch integrations:", error)
        set({
          error: error.name === "AbortError" ? "Request timed out - please try again" : error.message,
          loading: false,
          integrations: [],
        })
      }
    },

    connectIntegration: async (providerId: string) => {
      const { setLoading, providers, setError, fetchIntegrations, integrations, loadingStates } = get()
      const provider = providers.find((p) => p.id === providerId)

      if (!provider) {
        throw new Error(`Provider ${providerId} not found`)
      }

      // Check if already loading to prevent duplicate requests
      if (loadingStates[`connect-${providerId}`]) {
        console.warn(`⚠️ Already connecting to ${providerId}, ignoring duplicate request`)
        return
      }

      console.log(`🔗 Starting connection process for ${providerId}`)

      if (!provider.isAvailable) {
        throw new Error(`${provider.name} integration is not configured. Missing environment variables.`)
      }

      setLoading(`connect-${providerId}`, true)
      setError(null)

      try {
        console.log(`🔗 Connecting to ${providerId}...`)

        // Enhanced error handling for authentication
        let user, session
        try {
          const authResult = await getSecureUserAndSession()
          user = authResult.user
          session = authResult.session
        } catch (authError) {
          console.error(`❌ Authentication error for ${providerId}:`, authError)
          setError(`Authentication failed: ${authError instanceof Error ? authError.message : 'Unknown error'}`)
          setLoading(`connect-${providerId}`, false)
          return
        }

        console.log(`✅ User authenticated for ${providerId}:`, user.id)

        const response = await fetch("/api/integrations/auth/generate-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            provider: providerId,
            forceFresh: providerId === 'microsoft-onenote', // Force fresh OAuth for OneNote
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          console.error(`❌ OAuth URL generation failed for ${providerId}:`, errorData)
          
          // Handle specific error cases
          if (response.status === 401) {
            throw new Error("Authentication expired. Please log in again.")
          } else if (response.status === 403) {
            throw new Error("Access denied. You may not have permission to connect this integration.")
          } else {
            throw new Error(errorData.error || `Failed to generate OAuth URL for ${provider.name}`)
          }
        }

        const data = await response.json()

        if (data.success && data.authUrl) {
          console.log(`🔍 About to open ${providerId} popup with URL:`, data.authUrl.substring(0, 100) + '...')
          
          // Close any existing popup before opening a new one
          const hadExistingPopup = !!currentOAuthPopup
          closeExistingPopup()
          
          if (hadExistingPopup) {
            console.log(`🔄 Closed existing popup before opening ${providerId}`)
          }
          
          // Add timestamp to make popup name unique each time
          const popupName = `oauth_popup_${providerId}_${Date.now()}`
          const popupFeatures = "width=600,height=700,scrollbars=yes,resizable=yes"
            
          console.log(`🔍 Opening ${providerId} popup with name: ${popupName}`)
          console.log(`🔍 Popup features: ${popupFeatures}`)
          
          // Check if document has focus (required for popup opening)
          if (!document.hasFocus()) {
            console.warn(`⚠️ Document doesn't have focus, popup might be blocked for ${providerId}`)
          }
          
          let popup = window.open(data.authUrl, popupName, popupFeatures)
          
          console.log(`🔍 window.open returned:`, popup ? 'valid popup window' : 'null/undefined')
          
          // Retry popup opening if it failed (sometimes helps with timing issues)
          if (!popup) {
            console.warn(`⚠️ First popup attempt failed for ${providerId}, retrying...`)
            await new Promise(resolve => setTimeout(resolve, 100)) // Brief delay
            popup = window.open(data.authUrl, popupName + '_retry', popupFeatures)
            console.log(`🔍 Retry window.open returned:`, popup ? 'valid popup window' : 'null/undefined')
          }
          
          if (!popup) {
            setLoading(`connect-${providerId}`, false)
            console.error(`❌ Popup blocked or failed to open for ${providerId}`)
            throw new Error("Popup blocked. Please allow popups for this site and ensure you clicked the button directly.")
          }
          
          // Additional popup validation
          if (popup.closed) {
            setLoading(`connect-${providerId}`, false)
            console.error(`❌ Popup was immediately closed for ${providerId}`)
            throw new Error("Popup was immediately closed. Please check popup blocker settings.")
          }

          // Update global popup reference
          currentOAuthPopup = popup

          console.log(`✅ OAuth popup opened for ${providerId}`)

          let closedByMessage = false
          
          // Declare timeout early so it can be referenced in messageHandler
          let connectionTimeout: NodeJS.Timeout

          const messageHandler = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return

            console.log(`📨 Received OAuth message for ${providerId}:`, event.data)

            if (event.data && event.data.type === "oauth-success") {
              console.log(`✅ OAuth successful for ${providerId}:`, event.data.message)
              console.log(`🔄 Provider: ${event.data.provider}, Expected: ${providerId}`)
              closedByMessage = true
              clearTimeout(connectionTimeout)
              window.removeEventListener("message", messageHandler)
              try {
                popup?.close()
              } catch (error) {
                // COOP policy may block popup operations
                console.warn("Failed to close popup:", error)
              }
              // Reset global popup reference
              currentOAuthPopup = null
              setLoading(`connect-${providerId}`, false)
              
              // Force refresh integrations with a small delay to ensure the backend has time to update
              console.log("⏱️ Setting timeout to refresh integrations after OAuth success")
              setTimeout(() => {
                console.log("⏱️ Timeout elapsed, fetching integrations after OAuth success")
                fetchIntegrations(true) // Force refresh from server
                emitIntegrationEvent('INTEGRATION_CONNECTED', { providerId })
              }, 1000) // Increased delay to 1 second
            } else if (event.data && event.data.type === "oauth-error") {
              console.error(`❌ OAuth error for ${providerId}:`, event.data.message)
              setError(event.data.message)
              closedByMessage = true
              clearTimeout(connectionTimeout)
              popup?.close()
              window.removeEventListener("message", messageHandler)
              // Reset global popup reference
              currentOAuthPopup = null
              setLoading(`connect-${providerId}`, false)
            } else if (event.data && event.data.type === "oauth-cancelled") {
              console.log(`🚫 OAuth cancelled for ${providerId}:`, event.data.message)
              closedByMessage = true
              clearTimeout(connectionTimeout)
              window.removeEventListener("message", messageHandler)
              // Reset global popup reference
              currentOAuthPopup = null
              setLoading(`connect-${providerId}`, false)
            }
          }

          window.addEventListener("message", messageHandler)

          // Use localStorage to check for OAuth responses (COOP-safe)
          const storageCheckPrefix = `oauth_response_${providerId}`;
          const storageCheckTimer = setInterval(() => {
            try {
              // Check localStorage for any keys that match our prefix
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(storageCheckPrefix)) {
                  try {
                    // Found a matching key, parse the response
                    const storedData = localStorage.getItem(key);
                    if (storedData) {
                      const responseData = JSON.parse(storedData);
                      console.log(`📦 Found OAuth response in localStorage: ${key}`, responseData);
                      
                      // Process the response
                      if (responseData.type === 'oauth-success') {
                        console.log(`✅ OAuth successful for ${providerId} via localStorage`);
                        closedByMessage = true;
                        clearInterval(storageCheckTimer);
                        clearTimeout(connectionTimeout);
                        window.removeEventListener("message", messageHandler);
                        // Reset global popup reference
                        currentOAuthPopup = null;
                        setLoading(`connect-${providerId}`, false);
                        
                        // Force refresh integrations
                        setTimeout(() => {
                          fetchIntegrations(true);
                          emitIntegrationEvent('INTEGRATION_CONNECTED', { providerId });
                        }, 1000);
                      } else if (responseData.type === 'oauth-error') {
                        console.error(`❌ OAuth error for ${providerId} via localStorage:`, responseData.message);
                        setError(responseData.message);
                        closedByMessage = true;
                        clearInterval(storageCheckTimer);
                        clearTimeout(connectionTimeout);
                        window.removeEventListener("message", messageHandler);
                        // Reset global popup reference
                        currentOAuthPopup = null;
                        setLoading(`connect-${providerId}`, false);
                      } else if (responseData.type === 'oauth-cancelled') {
                        console.log(`🚫 OAuth cancelled for ${providerId} via localStorage`);
                        closedByMessage = true;
                        clearInterval(storageCheckTimer);
                        clearTimeout(connectionTimeout);
                        window.removeEventListener("message", messageHandler);
                        // Reset global popup reference
                        currentOAuthPopup = null;
                        setLoading(`connect-${providerId}`, false);
                      }
                      
                      // Clean up localStorage
                      localStorage.removeItem(key);
                    }
                  } catch (parseError) {
                    console.error(`Error parsing localStorage data for key ${key}:`, parseError);
                  }
                }
              }
              
              // Note: We can't check popup.closed due to COOP policy
              // We rely on message events and localStorage polling for communication
            } catch (error) {
              console.error(`Error checking localStorage for ${providerId}:`, error);
            }
          }, 500)
          
          // Add timeout for initial connection (5 minutes, same as reconnection)
          connectionTimeout = setTimeout(() => {
            if (!closedByMessage) {
              console.log(`⏰ OAuth connection timed out for ${providerId}`)
              clearInterval(storageCheckTimer)
              try {
                popup.close()
              } catch (e) {
                console.warn("Failed to close popup on timeout:", e)
              }
              window.removeEventListener("message", messageHandler)
              // Reset global popup reference
              currentOAuthPopup = null
              setLoading(`connect-${providerId}`, false)
              setError(`Connection to ${provider.name} timed out. Please try again.`)
            }
          }, 5 * 60 * 1000) // 5 minutes
          
        } else {
          throw new Error(data.error || "Failed to get auth URL")
        }
      } catch (error: any) {
        console.error(`Error connecting to ${providerId}:`, error.message)
        
        // Provide more specific error messages for common popup issues
        if (error.message.includes('Popup blocked')) {
          setError(`Popup blocked for ${provider.name}. Please allow popups for this site in your browser settings, then try again.`)
        } else if (error.message.includes('popup was immediately closed')) {
          setError(`Popup was blocked for ${provider.name}. Please check your browser's popup blocker settings.`)
        } else if (error.message.includes('duplicate request')) {
          setError(`Already connecting to ${provider.name}. Please wait for the current connection to complete.`)
        } else {
          setError(`Failed to connect to ${provider.name}: ${error.message}`)
        }
        
        setLoading(`connect-${providerId}`, false)
      }
    },

    connectApiKeyIntegration: async (providerId: string, apiKey: string) => {
      const { setLoading, fetchIntegrations, setError } = get()
      setLoading(`connect-${providerId}`, true)
      setError(null)

      try {
        const { user, session } = await getSecureUserAndSession()

        const response = await fetch("/api/integrations/token-management", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            provider: providerId,
            apiKey: apiKey,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to save API key")
        }
        
        // Log the integration connection via API
        try {
          const supabase = getSupabaseClient()
          if (user && supabase) {
            await fetch("/api/audit/log-integration-event", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                integrationId: "api_key_connection",
                provider: providerId,
                eventType: "connect",
                details: { method: "api_key" }
              })
            })
          }
        } catch (auditError) {
          console.warn("Failed to log API key connection:", auditError)
        }
        
        await fetchIntegrations(true)
        emitIntegrationEvent('INTEGRATION_CONNECTED', { providerId })
      } catch (error: any) {
        console.error(`Failed to connect ${providerId}:`, error)
        setError(error.message)
      } finally {
        setLoading(`connect-${providerId}`, false)
      }
    },

    disconnectIntegration: async (integrationId: string) => {
      const { setLoading, fetchIntegrations, integrations, setError } = get()
      const integration = integrations.find((i) => i.id === integrationId)
      if (!integration) return

      setLoading(`disconnect-${integrationId}`, true)
      setError(null)

      try {
        const { user, session } = await getSecureUserAndSession()

        const response = await fetch(`/api/integrations/${integrationId}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to disconnect integration")
        }

        await fetchIntegrations(true)
        emitIntegrationEvent('INTEGRATION_DISCONNECTED', { integrationId, provider: integration.provider })
      } catch (error: any) {
        console.error(`Failed to disconnect ${integration.provider}:`, error)
        setError(error.message)
      } finally {
        setLoading(`disconnect-${integrationId}`, false)
      }
    },

    refreshAllTokens: async () => {
      const { setLoading, setError, fetchIntegrations } = get()
      setLoading("refresh-all", true)
      setError(null)

      try {
        const response = await fetch("/api/integrations/refresh-tokens", { method: "POST" })
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to refresh tokens")
        }
        set({ loading: false })
      } catch (error: any) {
        console.error("Error refreshing tokens:", error)
        set({ loading: false, error: error.message })
      }
    },

    getIntegrationStatus: (providerId: string) => {
      const { integrations } = get()
      
      const integration = integrations.find((i) => i.provider === providerId)
      return integration?.status || "disconnected"
    },

    getIntegrationByProvider: (providerId: string) => {
      const { integrations } = get()
      
      const integration = integrations.find((i) => i.provider === providerId)
      return integration || null
    },

    getConnectedProviders: () => {
      const { integrations } = get()
      // Return all integrations that exist (not just "connected" ones)
      // This includes expired, needs_reauthorization, etc. since they can be reconnected
      // Include OneNote if it has a valid connected status
      const connectedProviders = integrations
        .filter((i) => i.status !== "disconnected")
        .map((i) => i.provider)
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
            console.log('Discord guilds prefetch skipped:', error.message)
          })
        ])
      } catch (error) {
        console.error("Error during global preload:", error)
        get().setError("Failed to load initial data.")
      } finally {
        set({ globalPreloadingData: false })
      }
    },

    loadIntegrationData: async (providerId, integrationId, params) => {
      const { setLoading, setError, integrationData } = get()
      
              // Generate cache key - include channelId for Discord messages and reactions
        let cacheKey: string = providerId
        if (providerId === "discord_messages" && params?.channelId) {
          cacheKey = `${providerId}_${params.channelId}`
        } else if (providerId === "discord_reactions" && params?.channelId && params?.messageId) {
          cacheKey = `${providerId}_${params.channelId}_${params.messageId}`
        }
        
        // For Discord data, always fetch fresh data to avoid showing deleted messages
        const isDiscordData = providerId.includes('discord')
        
        // Check if data is already cached (unless force refresh is requested or it's Discord data)
        if (!params?.forceRefresh && !isDiscordData && integrationData[cacheKey]) {
          console.log(`📋 Using cached data for ${cacheKey}`)
          return integrationData[cacheKey]
        }
        
        // For Discord data, log that we're fetching fresh data
        if (isDiscordData) {
          console.log(`🔄 Fetching fresh Discord data for ${cacheKey} (avoiding cache to prevent deleted messages)`)
        }
      
      setLoading(`data-${providerId}`, true)

      try {
        let url = ""
        let dataType = providerId // Default to providerId
        
        switch (providerId) {
          case "gmail-enhanced-recipients":
            url = "/api/integrations/fetch-user-data"
            dataType = "gmail-enhanced-recipients"
            break
          case "gmail_messages":
            url = "/api/integrations/gmail/messages"
            break
          case "gmail_labels":
            url = "/api/integrations/fetch-user-data"
            dataType = "gmail_labels"
            break
          case "gmail-recent-recipients":
            url = "/api/integrations/fetch-user-data"
            dataType = "gmail-recent-recipients"
            break
          case "google-calendars":
            url = "/api/integrations/fetch-user-data"
            dataType = "google-calendars"
            break
          case "google-calendar":
            url = "/api/integrations/fetch-user-data"
            dataType = "google-calendar"
            break
          case "google-drive-folders":
            url = "/api/integrations/fetch-user-data"
            dataType = "google-drive-folders"
            break
          case "google-drive-files":
            url = "/api/integrations/fetch-user-data"
            dataType = "google-drive-files"
            break
          case "onedrive-folders":
            url = "/api/integrations/fetch-user-data"
            dataType = "onedrive-folders"
            break
          case "dropbox-folders":
            url = "/api/integrations/fetch-user-data"
            dataType = "dropbox-folders"
            break
          case "box-folders":
            url = "/api/integrations/fetch-user-data"
            dataType = "box-folders"
            break
          case "google-sheets_spreadsheets":
            url = "/api/integrations/fetch-user-data"
            dataType = "google-sheets_spreadsheets"
            break
          case "google-sheets_sheets":
            url = "/api/integrations/fetch-user-data"
            dataType = "google-sheets_sheets"
            break
          case "google-sheets_sheet-preview":
            url = "/api/integrations/fetch-user-data"
            dataType = "google-sheets_sheet-preview"
            break
          case "google-sheets_sheet-data":
            url = "/api/integrations/fetch-user-data"
            dataType = "google-sheets_sheet-data"
            break
          case "google-docs_documents":
            url = "/api/integrations/fetch-user-data"
            dataType = "google-docs_documents"
            break
          case "google-docs_templates":
            url = "/api/integrations/fetch-user-data"
            dataType = "google-docs_templates"
            break
          case "google-docs_recent_documents":
            url = "/api/integrations/fetch-user-data"
            dataType = "google-docs_recent_documents"
            break
          case "google-docs_shared_documents":
            url = "/api/integrations/fetch-user-data"
            dataType = "google-docs_shared_documents"
            break
          case "google-docs_folders":
            url = "/api/integrations/fetch-user-data"
            dataType = "google-docs_folders"
            break
          case "youtube_channels":
            url = "/api/integrations/fetch-user-data"
            dataType = "youtube_channels"
            break
          case "youtube_videos":
            url = "/api/integrations/fetch-user-data"
            dataType = "youtube_videos"
            break
          case "youtube_playlists":
            url = "/api/integrations/fetch-user-data"
            dataType = "youtube_playlists"
            break
          case "teams_chats":
            url = "/api/integrations/fetch-user-data"
            dataType = "teams_chats"
            break
          case "teams_teams":
            url = "/api/integrations/fetch-user-data"
            dataType = "teams_teams"
            break
          case "teams_channels":
            url = "/api/integrations/fetch-user-data"
            dataType = "teams_channels"
            break
          case "github_repositories":
            url = "/api/integrations/fetch-user-data"
            dataType = "github_repositories"
            break
          case "gitlab_projects":
            url = "/api/integrations/fetch-user-data"
            dataType = "gitlab_projects"
            break
          case "notion_databases":
            url = "/api/integrations/fetch-user-data"
            dataType = "notion_databases"
            break
          case "notion_pages":
            url = "/api/integrations/fetch-user-data"
            dataType = "notion_pages"
            break
          case "notion_workspaces":
            url = "/api/integrations/fetch-user-data"
            dataType = "notion_workspaces"
            break
          case "notion_templates":
            url = "/api/integrations/fetch-user-data"
            dataType = "notion_templates"
            break
          case "trello_boards":
            url = "/api/integrations/fetch-user-data"
            dataType = "trello_boards"
            break
          case "trello_lists":
            url = "/api/integrations/fetch-user-data"
            dataType = "trello_lists"
            break
          case "trello_cards":
            url = "/api/integrations/fetch-user-data"
            dataType = "trello_cards"
            break
          case "hubspot_companies":
            url = "/api/integrations/fetch-user-data"
            dataType = "hubspot_companies"
            break
          case "hubspot_contacts":
            url = "/api/integrations/fetch-user-data"
            dataType = "hubspot_contacts"
            break
          case "hubspot_deals":
            url = "/api/integrations/fetch-user-data"
            dataType = "hubspot_deals"
            break
          case "hubspot_lists":
            url = "/api/integrations/fetch-user-data"
            dataType = "hubspot_lists"
            break
          case "hubspot_pipelines":
            url = "/api/integrations/fetch-user-data"
            dataType = "hubspot_pipelines"
            break
          case "hubspot_deal_stages":
            url = "/api/integrations/fetch-user-data"
            dataType = "hubspot_deal_stages"
            break
          case "hubspot_job_titles":
            url = "/api/integrations/fetch-user-data"
            dataType = "hubspot_job_titles"
            break
          case "hubspot_departments":
            url = "/api/integrations/fetch-user-data"
            dataType = "hubspot_departments"
            break
          case "hubspot_industries":
            url = "/api/integrations/fetch-user-data"
            dataType = "hubspot_industries"
            break
          case "hubspot_contact_properties":
            url = "/api/integrations/fetch-user-data"
            dataType = "hubspot_contact_properties"
            break
          case "hubspot_all_contact_properties":
            url = "/api/integrations/hubspot/all-contact-properties"
            dataType = "hubspot_all_contact_properties"
            break
          case "hubspot_all_company_properties":
            url = "/api/integrations/hubspot/all-company-properties"
            dataType = "hubspot_all_company_properties"
            break
          case "airtable_bases":
            url = "/api/integrations/fetch-user-data"
            dataType = "airtable_bases"
            break
          case "airtable_workspaces":
            url = "/api/integrations/fetch-user-data"
            dataType = "airtable_workspaces"
            break
          case "airtable_tables":
            url = "/api/integrations/fetch-user-data"
            dataType = "airtable_tables"
            break
          case "airtable_records":
            url = "/api/integrations/fetch-user-data"
            dataType = "airtable_records"
            break
          case "airtable_feedback_records":
            url = "/api/integrations/fetch-user-data"
            dataType = "airtable_feedback_records"
            break
          case "airtable_task_records":
            url = "/api/integrations/fetch-user-data"
            dataType = "airtable_task_records"
            break
          case "airtable_project_records":
            url = "/api/integrations/fetch-user-data"
            dataType = "airtable_project_records"
            break
          case "gumroad_products":
            url = "/api/integrations/fetch-user-data"
            dataType = "gumroad_products"
            break
          case "blackbaud_constituents":
            url = "/api/integrations/fetch-user-data"
            dataType = "blackbaud_constituents"
            break
          case "facebook_pages":
            url = "/api/integrations/fetch-user-data"
            dataType = "facebook_pages"
            break
          case "facebook_conversations":
            url = "/api/integrations/facebook/conversations"
            dataType = "facebook_conversations"
            break
          case "facebook_posts":
            url = "/api/integrations/facebook/posts"
            dataType = "facebook_posts"
            break
          case "onenote_notebooks":
            url = "/api/integrations/fetch-user-data"
            dataType = "onenote_notebooks"
            break
          case "onenote_sections":
            url = "/api/integrations/fetch-user-data"
            dataType = "onenote_sections"
            break
          case "onenote_pages":
            url = "/api/integrations/fetch-user-data"
            dataType = "onenote_pages"
            break
          case "outlook_folders":
            url = "/api/integrations/fetch-user-data"
            dataType = "outlook_folders"
            break
          case "outlook_messages":
            url = "/api/integrations/fetch-user-data"
            dataType = "outlook_messages"
            break
          case "outlook_contacts":
            url = "/api/integrations/fetch-user-data"
            dataType = "outlook_contacts"
            break
          case "outlook-enhanced-recipients":
            url = "/api/integrations/fetch-user-data"
            dataType = "outlook-enhanced-recipients"
            break
          case "outlook_calendars":
            url = "/api/integrations/fetch-user-data"
            dataType = "outlook_calendars"
            break
          case "outlook_events":
            url = "/api/integrations/fetch-user-data"
            dataType = "outlook_events"
            break
          case "outlook_signatures":
            url = "/api/integrations/fetch-user-data"
            dataType = "outlook_signatures"
            break
          case "gmail_signatures":
            url = "/api/integrations/fetch-user-data"
            dataType = "gmail_signatures"
            break
          case "twitter_mentions":
            url = "/api/integrations/fetch-user-data"
            dataType = "twitter_mentions"
            break
          case "slack-channels":
            url = "/api/integrations/slack/load-data"
            dataType = "slack-channels"
            break
          case "slack_workspaces":
            url = "/api/integrations/fetch-user-data"
            dataType = "slack_workspaces"
            break
          case "slack_users":
            url = "/api/integrations/fetch-user-data"
            dataType = "slack_users"
            break
          case "trello-boards":
            url = "/api/integrations/fetch-user-data"
            dataType = "trello-boards"
            break
          case "trello-list-templates":
            url = "/api/integrations/fetch-user-data"
            dataType = "trello-list-templates"
            break
          case "trello-card-templates":
            url = "/api/integrations/fetch-user-data"
            dataType = "trello-card-templates"
            break
          case "discord_channels":
            url = "/api/integrations/fetch-user-data"
            dataType = "discord_channels"
            break
          case "discord_guilds":
            // Use cached Discord guilds loader instead of direct API call
            try {
              const cachedGuilds = await loadDiscordGuildsOnce(params?.forceRefresh)
              set((state) => ({
                integrationData: {
                  ...state.integrationData,
                  [cacheKey]: cachedGuilds,
                },
              }))
              setLoading(`data-${providerId}`, false)
              return cachedGuilds
            } catch (error: any) {
              console.error(`Failed to load Discord guilds from cache:`, error)
              setError(`Failed to load Discord guilds.`)
              setLoading(`data-${providerId}`, false)
              return null
            }
            break
          case "discord_users":
            url = "/api/integrations/fetch-user-data"
            dataType = "discord_users"
            break
          case "discord_categories":
            url = "/api/integrations/fetch-user-data"
            dataType = "discord_categories"
            break
          case "discord_members":
            url = "/api/integrations/fetch-user-data"
            dataType = "discord_members"
            break
          case "discord_roles":
            url = "/api/integrations/fetch-user-data"
            dataType = "discord_roles"
            break
          case "discord_messages":
            url = "/api/integrations/fetch-user-data"
            dataType = "discord_messages"
            break
          case "discord_reactions":
            url = "/api/integrations/fetch-user-data"
            dataType = "discord_reactions"
            break
          case "discord_banned_users":
            url = "/api/integrations/fetch-user-data"
            dataType = "discord_banned_users"
            break
          default:
            throw new Error(`Loading data for ${providerId} is not supported.`)
        }

        const provider = providerId === 'onenote_notebooks' ? 'microsoft-onenote' :
                       providerId === 'onenote_sections' ? 'microsoft-onenote' :
                       providerId === 'onenote_pages' ? 'microsoft-onenote' :
                       providerId === 'outlook_folders' ? 'microsoft-outlook' :
                       providerId === 'outlook_messages' ? 'microsoft-outlook' :
                       providerId === 'outlook_contacts' ? 'microsoft-outlook' :
                       providerId === 'outlook-enhanced-recipients' ? 'microsoft-outlook' :
                       providerId === 'outlook_calendars' ? 'microsoft-outlook' :
                       providerId === 'outlook_events' ? 'microsoft-outlook' :
                       providerId === 'outlook_signatures' ? 'microsoft-outlook' :
                       providerId === 'gmail_signatures' ? 'gmail' :
                       providerId === 'gmail-recent-recipients' ? 'gmail' :
                       providerId === 'gmail-enhanced-recipients' ? 'gmail' :
                       providerId === 'twitter_mentions' ? 'twitter' :
                       providerId === 'google-calendars' ? 'google-calendar' :
                       providerId === 'google-drive-folders' ? 'google-drive' :
                       providerId === 'google-drive-files' ? 'google-drive' :
                       providerId === 'onedrive-folders' ? 'onedrive' :
                       providerId === 'dropbox-folders' ? 'dropbox' :
                       providerId === 'box-folders' ? 'box' :
                       providerId === 'google-sheets_spreadsheets' ? 'google-sheets' :
                       providerId === 'google-sheets_sheets' ? 'google-sheets' :
                       providerId === 'google-sheets_sheet-preview' ? 'google-sheets' :
                       providerId === 'google-sheets_sheet-data' ? 'google-sheets' :
                       providerId === 'google-docs_recent_documents' ? 'google-docs' :
                       providerId === 'google-docs_shared_documents' ? 'google-docs' :
                       providerId === 'google-docs_folders' ? 'google-docs' :
                       providerId === 'slack_workspaces' ? 'slack' :
                       providerId === 'slack_users' ? 'slack' :
                       providerId === 'discord_channels' ? 'discord' :
                       providerId === 'discord_guilds' ? 'discord' :
                       providerId === 'discord_users' ? 'discord' :
                       providerId === 'discord_messages' ? 'discord' :
                       providerId === 'discord_reactions' ? 'discord' :
                       providerId === 'discord_categories' ? 'discord' :
                       providerId === 'discord_banned_users' ? 'discord' :
                       providerId === 'facebook_pages' ? 'facebook' :
                       providerId === 'facebook_conversations' ? 'facebook' :
                       providerId === 'facebook_posts' ? 'facebook' :
                       providerId.includes('_') ? providerId.split('_')[0] : 
                       providerId.includes('-') ? providerId.split('-')[0] : 
                       providerId // Extract base provider name

        console.log(`🔍 Provider mapping result: providerId="${providerId}" -> provider="${provider}"`)

        const requestBody = url.includes('/gmail/') && !url.includes('/fetch-user-data') 
          ? { integrationId } 
          : { 
              integrationId,
              dataType: params?.dataType || dataType, // Allow override via params
              options: params || {}
            }

        // console.log(`🌐 Integration Store: Loading data for ${providerId}, URL: ${url}, integrationId: ${integrationId}`)
        // console.log(`🔍 Provider mapping debug: providerId="${providerId}", includes('_')=${providerId.includes('_')}, includes('-')=${providerId.includes('-')}`)
        // console.log(`🔍 Request body:`, requestBody)

        // Use GET for specific endpoints that don't need POST data
        let response
        if (url.includes('/hubspot/all-contact-properties')) {
          response = await apiClient.get(url)
        } else {
          response = await apiClient.post(url, { 
            ...requestBody,
            ...params 
          })
        }
        
        // console.log(`🔍 Integration Store: API Response for ${providerId}:`, response)
        
        // Handle the structured response from apiClient
        if (!response.success) {
          throw new Error(response.error || 'Failed to load integration data')
        }
        
        const data = response.data

        set((state) => ({
          integrationData: {
            ...state.integrationData,
            [cacheKey]: data,
          },
        }))
        setLoading(`data-${providerId}`, false)
        return data
      } catch (error: any) {
        console.error(`Failed to load data for ${providerId}:`, error)
        setError(`Failed to load data for ${providerId}.`)
        setLoading(`data-${providerId}`, false)
        return null
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

    clearDiscordCache: () => {
      const { integrationData } = get()
      const newIntegrationData = { ...integrationData }
      
      // Remove all Discord-related cached data
      Object.keys(newIntegrationData).forEach(key => {
        if (key.includes('discord')) {
          console.log(`🗑️ Clearing Discord cache for: ${key}`)
          delete newIntegrationData[key]
        }
      })
      
      set({ integrationData: newIntegrationData })
      console.log('✅ Discord cache cleared')
    },

    reconnectIntegration: async (integrationId: string) => {
      console.log("🔄 reconnectIntegration called with:", integrationId)
      const { setLoading, fetchIntegrations, integrations, setError } = get()
      const integration = integrations.find((i) => i.id === integrationId)
      
      if (!integration) {
        console.error("❌ Integration not found for ID:", integrationId)
        return
      }

      console.log("✅ Found integration:", integration.provider)
      setLoading(`reconnect-${integrationId}`, true)
      setError(null)

      try {
        const { user, session } = await getSecureUserAndSession()

        // Ensure provider is valid and properly formatted
        const provider = integration.provider.trim().toLowerCase()
        console.log(`🔍 Reconnecting provider: "${provider}" (ID: ${integrationId})`)
        
        // Extra validation for Google Calendar to prevent confusion with Microsoft Outlook
        if (provider === 'google-calendar') {
          console.log('⚠️ Special handling for Google Calendar reconnection')
          console.log('🔵 Provider being reconnected:', provider)
          console.log('🔵 Integration ID:', integrationId)
          console.log('🔵 Integration provider:', integration.provider)
        }
        
        // Generate OAuth URL for reconnection
        console.log("🔄 Generating OAuth URL for reconnection...")
        const authResponse = await fetch("/api/integrations/auth/generate-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            provider: provider, // Use normalized provider name
            reconnect: true,
            integrationId: integrationId,
            // Add timestamp to prevent caching
            timestamp: Date.now()
          }),
        })

        if (!authResponse.ok) {
          const errorData = await authResponse.json().catch(() => ({}))
          throw new Error(errorData.error || "Failed to generate OAuth URL")
        }

        const authData = await authResponse.json()
        
        if (!authData.success || !authData.authUrl) {
          throw new Error("Failed to generate OAuth URL for reconnection")
        }

        console.log("✅ OAuth URL generated, opening popup...")
        console.log("🔗 Auth URL:", authData.authUrl)
        
        // Verify the URL is for the correct provider
        const urlProvider = provider.toLowerCase()
        const authUrl = authData.authUrl
        
        // Extra validation for Google Calendar to prevent Microsoft Outlook confusion
        if (urlProvider === 'google-calendar' && !authUrl.includes('accounts.google.com')) {
          throw new Error(`Invalid OAuth URL for Google Calendar: ${authUrl}`)
        }
        
        // Open OAuth popup with unique name to prevent reuse of windows
        const width = 600
        const height = 700
        const left = window.screen.width / 2 - width / 2
        const top = window.screen.height / 2 - height / 2
        const timestamp = Date.now()
        const popupName = `oauth_reconnect_${urlProvider}_${timestamp}`
        
        // Clear any localStorage items with the same prefix to prevent confusion
        const storagePrefix = `oauth_response_${urlProvider}`;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(storagePrefix)) {
            localStorage.removeItem(key);
          }
        }
        
        // Close any existing popup before opening a new one
        closeExistingPopup()
        
        const popup = window.open(
          authUrl,
          popupName,
          `width=${width},height=${height},left=${left},top=${top}`,
        )

        if (!popup) {
          throw new Error("Failed to open OAuth popup. Please allow popups and try again.")
        }

        // Update global popup reference
        currentOAuthPopup = popup

        // Wait for OAuth completion
        await new Promise((resolve, reject) => {
          let messageReceived = false
          
          const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) {
              return
            }
            
            console.log("📨 Received OAuth message:", event.data)
            messageReceived = true
            
            if (event.data.type === "oauth-success") {
              console.log("✅ OAuth reconnection successful")
              try {
                popup.close()
              } catch (e) {
                console.warn("Failed to close popup:", e)
              }
              window.removeEventListener("message", handleMessage)
              // Reset global popup reference
              currentOAuthPopup = null
              fetchIntegrations(true)
              resolve(undefined)
            } else if (event.data.type === "oauth-error") {
              console.error("❌ OAuth reconnection failed:", event.data.message)
              try {
                popup.close()
              } catch (e) {
                console.warn("Failed to close popup:", e)
              }
              window.removeEventListener("message", handleMessage)
              // Reset global popup reference
              currentOAuthPopup = null
              reject(new Error(event.data.message || "OAuth reconnection failed"))
            } else if (event.data.type === "oauth-cancelled") {
              console.log("🚫 OAuth reconnection cancelled")
              try {
                popup.close()
              } catch (e) {
                console.warn("Failed to close popup:", e)
              }
              window.removeEventListener("message", handleMessage)
              // Reset global popup reference
              currentOAuthPopup = null
              reject(new Error("OAuth reconnection was cancelled"))
            }
          }

          window.addEventListener("message", handleMessage)
          
          // Use localStorage to check for OAuth responses (COOP-safe)
          const storageCheckPrefix = `oauth_response_${integration.provider}`;
          const checkPopupClosed = setInterval(() => {
            try {
              // Check localStorage for any keys that match our prefix
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(storageCheckPrefix)) {
                  try {
                    // Found a matching key, parse the response
                    const storedData = localStorage.getItem(key);
                    if (storedData) {
                      const responseData = JSON.parse(storedData);
                      console.log(`📦 Found OAuth response in localStorage: ${key}`, responseData);
                      
                      // Process the response
                      if (responseData.type === 'oauth-success') {
                        console.log(`✅ OAuth reconnection successful via localStorage`);
                        messageReceived = true;
                        clearInterval(checkPopupClosed);
                        window.removeEventListener("message", handleMessage);
                        // Reset global popup reference
                        currentOAuthPopup = null;
                        fetchIntegrations(true);
                        emitIntegrationEvent('INTEGRATION_RECONNECTED', { integrationId, provider: integration.provider });
                        resolve(undefined);
                      } else if (responseData.type === 'oauth-error') {
                        console.error(`❌ OAuth reconnection failed via localStorage:`, responseData.message);
                        messageReceived = true;
                        clearInterval(checkPopupClosed);
                        window.removeEventListener("message", handleMessage);
                        // Reset global popup reference
                        currentOAuthPopup = null;
                        reject(new Error(responseData.message || "OAuth reconnection failed"));
                      } else if (responseData.type === 'oauth-cancelled') {
                        console.log(`🚫 OAuth reconnection cancelled via localStorage`);
                        messageReceived = true;
                        clearInterval(checkPopupClosed);
                        window.removeEventListener("message", handleMessage);
                        // Reset global popup reference
                        currentOAuthPopup = null;
                        reject(new Error("OAuth reconnection was cancelled"));
                      }
                      
                      // Clean up localStorage
                      localStorage.removeItem(key);
                    }
                  } catch (parseError) {
                    console.error(`Error parsing localStorage data for key ${key}:`, parseError);
                  }
                }
              }
              
              // Note: We can't check popup.closed due to COOP policy
              // We rely on message events and localStorage polling for communication
            } catch (error) {
              console.error(`Error checking localStorage for OAuth response:`, error);
            }
          }, 1000)
          
          // Timeout after 5 minutes
          const timeout = setTimeout(() => {
            console.log("⏰ OAuth reconnection timed out")
            clearInterval(checkPopupClosed)
            try {
              popup.close()
            } catch (e) {
              console.warn("Failed to close popup on timeout:", e)
            }
            window.removeEventListener("message", handleMessage)
            // Reset global popup reference
            currentOAuthPopup = null
            reject(new Error("OAuth reconnection timed out"))
          }, 5 * 60 * 1000)
          
          // Clean up timeout and interval when message is received
          const originalResolve = resolve
          const originalReject = reject
          
          // Override resolve/reject to clean up timers
          const wrappedResolve = (value: any) => {
            clearTimeout(timeout)
            clearInterval(checkPopupClosed)
            originalResolve(value)
          }
          
          const wrappedReject = (error: any) => {
            clearTimeout(timeout)
            clearInterval(checkPopupClosed)
            originalReject(error)
          }
          
          // Replace the resolve/reject in the message handler
          const originalHandleMessage = handleMessage
          window.removeEventListener("message", originalHandleMessage)
          
          const newHandleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) {
              return
            }
            
            console.log("📨 Received OAuth message:", event.data)
            messageReceived = true
            
            if (event.data.type === "oauth-success") {
              console.log("✅ OAuth reconnection successful")
              try {
                popup.close()
              } catch (e) {
                console.warn("Failed to close popup:", e)
              }
              window.removeEventListener("message", newHandleMessage)
              // Reset global popup reference
              currentOAuthPopup = null
              fetchIntegrations(true)
              emitIntegrationEvent('INTEGRATION_RECONNECTED', { integrationId, provider: integration.provider })
              wrappedResolve(undefined)
            } else if (event.data.type === "oauth-error") {
              console.error("❌ OAuth reconnection failed:", event.data.message)
              try {
                popup.close()
              } catch (e) {
                console.warn("Failed to close popup:", e)
              }
              window.removeEventListener("message", newHandleMessage)
              // Reset global popup reference
              currentOAuthPopup = null
              wrappedReject(new Error(event.data.message || "OAuth reconnection failed"))
            } else if (event.data.type === "oauth-cancelled") {
              console.log("🚫 OAuth reconnection cancelled")
              try {
                popup.close()
              } catch (e) {
                console.warn("Failed to close popup:", e)
              }
              window.removeEventListener("message", newHandleMessage)
              // Reset global popup reference
              currentOAuthPopup = null
              wrappedReject(new Error("OAuth reconnection was cancelled"))
            }
          }
          
          window.addEventListener("message", newHandleMessage)
        })

      } catch (error: any) {
        console.error(`❌ Failed to reconnect ${integration.provider}:`, error)
        setError(error.message)
        throw error
      } finally {
        console.log("🏁 Reconnection process finished")
        setLoading(`reconnect-${integrationId}`, false)
      }
    },

    deleteIntegration: async (integrationId: string) => {
      const { setLoading, integrations, fetchIntegrations, setError } = get()
      const integration = integrations.find((i) => i.id === integrationId)
      if (!integration) return

      setLoading(`delete-${integration.provider}`, true)
      setError(null)

      try {
        // ... implementation for deleting integration
      } catch (error: any) {
        setError(error.message)
      } finally {
        setLoading(`delete-${integration.provider}`, false)
      }
    },

    resetConnectionState: () => {
      // Close any existing popup and reset state
      closeExistingPopup()
      
      // Clear any loading states related to connections
      const { loadingStates } = get()
      const newLoadingStates = { ...loadingStates }
      
      // Find and clear any connect-* loading states
      Object.keys(newLoadingStates).forEach(key => {
        if (key.startsWith('connect-')) {
          newLoadingStates[key] = false
        }
      })
      
      set({ loadingStates: newLoadingStates, error: null })
    },

    // Helper function to check if integration needs reconnection due to missing scopes
    checkIntegrationScopes: (providerId: string) => {
      const { integrations } = get()
      const integration = integrations.find(i => i.provider === providerId)
      
      if (!integration || integration.status !== "connected") {
        return { needsReconnection: false, reason: "Integration not connected" }
      }

      const grantedScopes = integration.scopes || []
      console.log(`🔍 Checking scopes for ${providerId}:`, grantedScopes)
      
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
      
      console.log(`✅ All required scopes present for ${providerId}`)
      return { needsReconnection: false, reason: "All required scopes present" }
    },
  })
)
