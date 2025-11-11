"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "./use-auth"
import { toast } from "./use-toast"

import { logger } from '@/lib/utils/logger'

export interface Integration {
  id: string // Provider ID (e.g., "gmail", "slack")
  integrationId?: string // Database integration UUID (only when connected)
  name: string
  description: string
  icon: string
  category: string
  isConnected: boolean
  status: "connected" | "disconnected" | "error" | "pending"
  connectedAt?: string
  lastSync?: string
  scopes?: string[]
  error?: string
  // Account identification (from database)
  metadata?: {
    email?: string
    account_name?: string
    google_id?: string
    picture?: string
    [key: string]: any // Allow other metadata fields
  }
  // Slack-specific (top-level in database)
  team_name?: string
  team_id?: string
  // Legacy fields (backward compatibility)
  email?: string
  account_name?: string
}

export interface UseIntegrationsReturn {
  integrations: Integration[]
  loading: boolean
  error: string | null
  connectIntegration: (providerId: string) => Promise<void>
  disconnectIntegration: (providerId: string) => Promise<void>
  refreshIntegrations: () => Promise<void>
  getIntegrationStatus: (providerId: string) => Integration | null
}

export function useIntegrations(): UseIntegrationsReturn {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  const fetchIntegrations = useCallback(async () => {
    if (!user) {
      setIntegrations([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Fetch available integrations
      const availableResponse = await fetch("/api/integrations/available")
      if (!availableResponse.ok) {
        const errorText = await availableResponse.text()
        throw new Error(`Failed to fetch available integrations: ${availableResponse.status} ${errorText}`)
      }
      const availableData = await availableResponse.json()

      // Handle wrapped response format
      // /api/integrations/available returns: { success: true, data: { integrations: [...], stats: {...} } }
      let availableIntegrations = availableData.data?.integrations || availableData.integrations || []

      // Ensure it's an array
      if (!Array.isArray(availableIntegrations)) {
        logger.warn("Available integrations is not an array:", availableIntegrations)
        availableIntegrations = []
      }

      // Fetch user's connected integrations
      const connectedResponse = await fetch("/api/integrations")
      if (!connectedResponse.ok) {
        const errorText = await connectedResponse.text()
        throw new Error(`Failed to fetch connected integrations: ${connectedResponse.status} ${errorText}`)
      }
      const connectedData = await connectedResponse.json()

      // Handle wrapped response format
      // /api/integrations returns: { success: true, data: [...] } (array directly in data)
      let connectedIntegrations = connectedData.data || []

      // Ensure it's an array
      if (!Array.isArray(connectedIntegrations)) {
        logger.warn("Connected integrations is not an array:", connectedIntegrations)
        connectedIntegrations = []
      }

      // Merge available and connected integrations
      const mergedIntegrations = availableIntegrations.map((integration: any) => {
        const connected = connectedIntegrations.find((conn: any) => conn.provider === integration.id)
        return {
          ...integration,
          integrationId: connected?.id, // Database UUID for API calls
          isConnected: !!connected,
          status: connected ? "connected" : "disconnected",
          connectedAt: connected?.created_at,
          lastSync: connected?.last_sync,
          error: connected?.error_message,
          // Pass through account identification fields
          metadata: connected?.metadata,
          team_name: connected?.team_name,
          team_id: connected?.team_id,
          email: connected?.email,
          account_name: connected?.account_name,
        }
      })

      setIntegrations(mergedIntegrations)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch integrations"
      logger.error("Error fetching integrations:", { error: err, message: errorMessage })
      setError(errorMessage)

      // Don't show toast on every error, as this can be called multiple times
      // Only show if there's a meaningful error message
      if (errorMessage && errorMessage !== "Failed to fetch integrations") {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        })
      }
    } finally {
      setLoading(false)
    }
  }, [user])

  const connectIntegration = useCallback(async (providerId: string) => {
    try {
      setError(null)

      // Shopify-specific: Prompt for shop domain (cache bust: v2)
      let shop: string | undefined
      if (providerId.toLowerCase() === 'shopify') {
        shop = window.prompt(
          'Enter your Shopify store domain:',
          'your-store.myshopify.com'
        )?.trim()

        if (!shop) {
          // User cancelled
          return
        }

        // Basic validation
        if (!shop.includes('.')) {
          shop = `${shop}.myshopify.com`
        }
      }

      // Store the current integration state before redirect
      localStorage.setItem("integration_connecting", providerId)
      localStorage.setItem("integration_redirect_timestamp", Date.now().toString())

      // Update integration status to pending
      setIntegrations((prev) =>
        prev.map((integration) =>
          integration.id === providerId ? { ...integration, status: "pending" as const } : integration,
        ),
      )

      // Generate OAuth URL
      const requestBody: any = { provider: providerId }
      if (shop) {
        requestBody.shop = shop
      }

      const response = await fetch("/api/integrations/auth/generate-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(errorData.error || errorData.message || "Failed to generate OAuth URL")
      }

      const { authUrl } = await response.json()

      // Store return URL for after authorization
      const returnUrl = window.location.href
      localStorage.setItem("integration_return_url", returnUrl)

      // Redirect directly to OAuth provider
      window.location.href = authUrl
    } catch (err) {
      logger.error("Error connecting integration:", err)
      setError(err instanceof Error ? err.message : "Failed to connect integration")

      // Clean up localStorage on error
      localStorage.removeItem("integration_connecting")
      localStorage.removeItem("integration_redirect_timestamp")
      localStorage.removeItem("integration_return_url")

      // Reset integration status
      setIntegrations((prev) =>
        prev.map((integration) =>
          integration.id === providerId ? { ...integration, status: "disconnected" as const } : integration,
        ),
      )

      toast({
        title: "Connection Failed",
        description: "Failed to connect integration. Please try again.",
        variant: "destructive",
      })
    }
  }, [])

  const disconnectIntegration = useCallback(async (providerId: string) => {
    try {
      setError(null)

      const response = await fetch(`/api/integrations/${providerId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to disconnect integration")
      }

      // Update local state
      setIntegrations((prev) =>
        prev.map((integration) =>
          integration.id === providerId
            ? {
                ...integration,
                isConnected: false,
                status: "disconnected" as const,
                connectedAt: undefined,
                lastSync: undefined,
                error: undefined,
              }
            : integration,
        ),
      )

      toast({
        title: "Integration Disconnected",
        description: `Successfully disconnected ${providerId} integration.`,
      })
    } catch (err) {
      logger.error("Error disconnecting integration:", err)
      setError(err instanceof Error ? err.message : "Failed to disconnect integration")
      toast({
        title: "Disconnection Failed",
        description: "Failed to disconnect integration. Please try again.",
        variant: "destructive",
      })
    }
  }, [])

  const refreshIntegrations = useCallback(async () => {
    await fetchIntegrations()
  }, [fetchIntegrations])

  const getIntegrationStatus = useCallback(
    (providerId: string): Integration | null => {
      return integrations.find((integration) => integration.id === providerId) || null
    },
    [integrations],
  )

  const handlePostRedirectSetup = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const success = urlParams.get("success")
    const error = urlParams.get("error")
    const provider = urlParams.get("provider")

    const connectingProvider = localStorage.getItem("integration_connecting")
    const redirectTimestamp = localStorage.getItem("integration_redirect_timestamp")
    const returnUrl = localStorage.getItem("integration_return_url")

    // Check if we're returning from an OAuth flow
    if ((success || error) && provider) {
      // Clean up localStorage
      localStorage.removeItem("integration_connecting")
      localStorage.removeItem("integration_redirect_timestamp")
      localStorage.removeItem("integration_return_url")

      if (success) {
        toast({
          title: "Integration Connected",
          description: `Successfully connected ${provider} integration.`,
          duration: 5000,
        })
      } else if (error) {
        toast({
          title: "Connection Failed",
          description: decodeURIComponent(error),
          variant: "destructive",
          duration: 8000,
        })
      }

      // Clean up URL parameters
      const cleanUrl = window.location.pathname
      window.history.replaceState({}, document.title, cleanUrl)

      // Refresh integrations
      fetchIntegrations()
    }
    // Handle case where user returns but connection is still pending
    else if (connectingProvider && redirectTimestamp) {
      const timestamp = Number.parseInt(redirectTimestamp)
      const timeSinceRedirect = Date.now() - timestamp

      // If more than 5 minutes have passed, assume connection failed
      if (timeSinceRedirect > 300000) {
        localStorage.removeItem("integration_connecting")
        localStorage.removeItem("integration_redirect_timestamp")
        localStorage.removeItem("integration_return_url")

        toast({
          title: "Connection Timeout",
          description: "The connection process took too long. Please try again.",
          variant: "destructive",
        })
      }
    }
  }, [fetchIntegrations])

  // Initial fetch
  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  // Listen for OAuth callback success/error
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return

      if (event.data.type === "OAUTH_SUCCESS") {
        toast({
          title: "Integration Connected",
          description: `Successfully connected ${event.data.provider} integration.`,
        })
        refreshIntegrations()
      } else if (event.data.type === "OAUTH_ERROR") {
        toast({
          title: "Connection Failed",
          description: event.data.error || "Failed to connect integration.",
          variant: "destructive",
        })
        refreshIntegrations()
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [refreshIntegrations])

  useEffect(() => {
    handlePostRedirectSetup()
  }, [handlePostRedirectSetup])

  return {
    integrations,
    loading,
    error,
    connectIntegration,
    disconnectIntegration,
    refreshIntegrations,
    getIntegrationStatus,
  }
}
