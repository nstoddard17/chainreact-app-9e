import { create } from "zustand"
import { getSupabaseClient } from "@/lib/supabase"
import { apiClient } from "@/lib/apiClient"

// Global variables for OAuth popup management
let currentOAuthPopup: Window | null = null
let windowHasLostFocus = false

// Track ongoing requests for cleanup
let currentAbortController: AbortController | null = null

// Helper function to check if popup is still valid
function isPopupValid(popup: Window | null): boolean {
  return !!(popup && !popup.closed)
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

    setLoading: (key: string, loading: boolean) =>
      set((state) => ({
        loadingStates: {
          ...state.loadingStates,
          [key]: loading,
        },
      })),

    setError: (error: string | null) => set({ error }),
    clearError: () => set({ error: null }),

    initializeProviders: async () => {
      const { loading } = get()
      if (loading) return

      try {
        set({ loading: true, error: null })

        const response = await apiClient.get("/api/integrations/available")

        if (!response.success) {
          throw new Error(response.error || "Failed to fetch available integrations")
        }

        const providers = Array.isArray(response.data) ? response.data : response.data?.integrations || response.data.integrations || response.data.providers || []

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
        const supabase = getSupabaseClient()
        if (!supabase) throw new Error("Supabase client not available")

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session?.access_token) {
          set({
            integrations: [],
            loading: false,
            error: "Please log in to view integrations",
          })
          return
        }

        // Get user ID from session if currentUserId is not set
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) {
          set({
            integrations: [],
            loading: false,
            error: "No authenticated user found",
          })
          return
        }

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
        console.log("✅ fetchIntegrations completed", { count: integrations.length })
        
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
      const { setLoading, providers, setError, fetchIntegrations } = get()
      const provider = providers.find((p) => p.id === providerId)

      if (!provider) {
        throw new Error(`Provider ${providerId} not found`)
      }

      if (!provider.isAvailable) {
        throw new Error(`${provider.name} integration is not configured. Missing environment variables.`)
      }

      setLoading(`connect-${providerId}`, true)
      setError(null)

      try {
        console.log(`🔗 Connecting to ${providerId}...`)

        const supabase = getSupabaseClient()
        if (!supabase) throw new Error("Supabase client not available")

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session?.access_token) {
          throw new Error("No valid session found. Please log in again.")
        }

        const response = await fetch("/api/integrations/auth/generate-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            provider: providerId,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to generate OAuth URL")
        }

        const data = await response.json()

        if (data.success && data.authUrl) {
          // Add timestamp to make popup name unique each time
          const popupName = `oauth_popup_${providerId}_${Date.now()}`
          const popup = window.open(data.authUrl, popupName, "width=600,height=700,scrollbars=yes,resizable=yes")
          if (!popup) {
            setLoading(`connect-${providerId}`, false)
            throw new Error("Popup blocked. Please allow popups for this site.")
          }

          console.log(`✅ OAuth popup opened for ${providerId}`)

          let closedByMessage = false

          const messageHandler = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return

            if (event.data && event.data.type === "oauth-success") {
              console.log(`✅ OAuth successful for ${providerId}:`, event.data.message)
              closedByMessage = true
              window.removeEventListener("message", messageHandler)
              if (popup && !popup.closed) {
                popup.close()
              }
              setLoading(`connect-${providerId}`, false)
              setTimeout(() => {
                fetchIntegrations(true)
              }, 500)
            } else if (event.data && event.data.type === "oauth-error") {
              console.error(`❌ OAuth error for ${providerId}:`, event.data.message)
              setError(event.data.message)
              closedByMessage = true
              popup?.close()
              window.removeEventListener("message", messageHandler)
              setLoading(`connect-${providerId}`, false)
            } else if (event.data && event.data.type === "oauth-cancelled") {
              console.log(`🚫 OAuth cancelled for ${providerId}:`, event.data.message)
              closedByMessage = true
              window.removeEventListener("message", messageHandler)
              setLoading(`connect-${providerId}`, false)
            }
          }

          window.addEventListener("message", messageHandler)

          const timer = setInterval(() => {
            if (popup?.closed) {
              clearInterval(timer)
              window.removeEventListener("message", messageHandler)
              if (!closedByMessage) {
                console.log(`❌ Popup closed manually for ${providerId}`)
                setError("Popup closed before completing authorization.")
                setLoading(`connect-${providerId}`, false)
              }
            }
          }, 500)
        } else {
          throw new Error(data.error || "Failed to get auth URL")
        }
      } catch (error: any) {
        console.error(`Error connecting to ${providerId}:`, error.message)
        setError(`Failed to connect to ${providerId}: ${error.message}`)
        setLoading(`connect-${providerId}`, false)
      }
    },

    connectApiKeyIntegration: async (providerId: string, apiKey: string) => {
      const { setLoading, fetchIntegrations, setError } = get()
      setLoading(`connect-${providerId}`, true)
      setError(null)

      try {
        const supabase = getSupabaseClient()
        if (!supabase) throw new Error("Supabase client not available")

        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.access_token) {
          throw new Error("No valid session found. Please log in again.")
        }

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
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
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
        const supabase = getSupabaseClient()
        if (!supabase) throw new Error("Supabase client not available")

        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.access_token) {
          throw new Error("No valid session found. Please log in again.")
        }

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
      return integrations.find((i) => i.provider === providerId) || null
    },

    getConnectedProviders: () => {
      const { integrations } = get()
      return integrations.filter((i) => i.status === "connected").map((i) => i.provider)
    },

    initializeGlobalPreload: async () => {
      const { initializeProviders, fetchIntegrations, preloadStarted } = get()
      if (preloadStarted) return
      set({ globalPreloadingData: true, preloadStarted: true })

      try {
        await Promise.all([initializeProviders(), fetchIntegrations()])
      } catch (error) {
        console.error("Error during global preload:", error)
        get().setError("Failed to load initial data.")
      } finally {
        set({ globalPreloadingData: false })
      }
    },

    loadIntegrationData: async (providerId, integrationId, params) => {
      const { setLoading, setError, integrationData } = get()
      
      // Check if data is already cached (unless force refresh is requested)
      if (!params?.forceRefresh && integrationData[providerId]) {
        console.log(`📋 Using cached data for ${providerId}`)
        return integrationData[providerId]
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
            url = "/api/integrations/gmail/labels"
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
          case "discord_guilds":
            url = "/api/integrations/fetch-user-data"
            dataType = "discord_guilds"
            break
          case "discord_channels":
            url = "/api/integrations/fetch-user-data"
            dataType = "discord_channels"
            break
          case "facebook_pages":
            url = "/api/integrations/fetch-user-data"
            dataType = "facebook_pages"
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
                       providerId.includes('_') ? providerId.split('_')[0] : 
                       providerId.includes('-') ? providerId.split('-')[0] : 
                       providerId // Extract base provider name

        console.log(`🔍 Provider mapping result: providerId="${providerId}" -> provider="${provider}"`)

        const requestBody = url.includes('/gmail/') && !url.includes('/fetch-user-data') 
          ? { integrationId } 
          : { 
              provider,
              dataType: params?.dataType || dataType, // Allow override via params
            }

        console.log(`🌐 Integration Store: Loading data for ${providerId}, URL: ${url}, integrationId: ${integrationId}`)
        console.log(`🔍 Provider mapping debug: providerId="${providerId}", includes('_')=${providerId.includes('_')}, includes('-')=${providerId.includes('-')}`)
        console.log(`🔍 Request body:`, requestBody)

        const response = await apiClient.post(url, { 
          ...requestBody,
          ...params 
        })
        
        console.log(`🔍 Integration Store: API Response for ${providerId}:`, response)
        
        // Handle the structured response from apiClient
        if (!response.success) {
          console.error(`❌ Integration Store: Failed response for ${providerId}:`, response)
          throw new Error(response.error || 'Failed to load integration data')
        }
        
        const data = response.data

        set((state) => ({
          integrationData: {
            ...state.integrationData,
            [providerId]: data,
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
        const supabase = getSupabaseClient()
        if (!supabase) throw new Error("Supabase client not available")

        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.access_token) {
          throw new Error("No valid session found. Please log in again.")
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
            provider: integration.provider,
            reconnect: true,
            integrationId: integrationId,
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
        
        // Open OAuth popup
        const width = 600
        const height = 700
        const left = window.screen.width / 2 - width / 2
        const top = window.screen.height / 2 - height / 2
        const popupName = `oauth_reconnect_${integration.provider}_${Date.now()}`
        
        const popup = window.open(
          authData.authUrl,
          popupName,
          `width=${width},height=${height},left=${left},top=${top}`,
        )

        if (!popup) {
          throw new Error("Failed to open OAuth popup. Please allow popups and try again.")
        }

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
              reject(new Error(event.data.message || "OAuth reconnection failed"))
            } else if (event.data.type === "oauth-cancelled") {
              console.log("🚫 OAuth reconnection cancelled")
              try {
                popup.close()
              } catch (e) {
                console.warn("Failed to close popup:", e)
              }
              window.removeEventListener("message", handleMessage)
              reject(new Error("OAuth reconnection was cancelled"))
            }
          }

          window.addEventListener("message", handleMessage)
          
          // Check if popup closes without sending a message
          const checkPopupClosed = setInterval(() => {
            if (popup.closed && !messageReceived) {
              console.log("❌ Popup closed without sending message")
              clearInterval(checkPopupClosed)
              window.removeEventListener("message", handleMessage)
              reject(new Error("OAuth popup closed unexpectedly"))
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
              fetchIntegrations(true)
              wrappedResolve(undefined)
            } else if (event.data.type === "oauth-error") {
              console.error("❌ OAuth reconnection failed:", event.data.message)
              try {
                popup.close()
              } catch (e) {
                console.warn("Failed to close popup:", e)
              }
              window.removeEventListener("message", newHandleMessage)
              wrappedReject(new Error(event.data.message || "OAuth reconnection failed"))
            } else if (event.data.type === "oauth-cancelled") {
              console.log("🚫 OAuth reconnection cancelled")
              try {
                popup.close()
              } catch (e) {
                console.warn("Failed to close popup:", e)
              }
              window.removeEventListener("message", newHandleMessage)
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
      // Close any existing popup
      if (currentOAuthPopup && !isPopupValid(currentOAuthPopup)) {
        try {
          currentOAuthPopup.close()
        } catch (e) {
          console.warn("Failed to close popup during reset:", e)
        }
      }
      
      // Reset variables
      currentOAuthPopup = null
      windowHasLostFocus = false
      
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
        const requiredScopes = [
          "User.Read",
          "Team.ReadBasic.All", 
          "Channel.ReadBasic.All",
          "Chat.Read",
          "ChatMessage.Send",
          "OnlineMeetings.ReadWrite"
        ]
        
        const missingScopes = requiredScopes.filter(scope => !grantedScopes.includes(scope))
        
        if (missingScopes.length > 0) {
          console.warn(`❌ Missing scopes for ${providerId}:`, missingScopes)
          return {
            needsReconnection: true,
            reason: `Teams integration requires additional permissions. Please reconnect your account to grant the necessary access.`,
            missingScopes
          }
        }
      }
      
      console.log(`✅ All required scopes present for ${providerId}`)
      return { needsReconnection: false, reason: "All required scopes present" }
    },
  })
)
