"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "./use-auth"
import { toast } from "./use-toast"

export interface Integration {
  id: string
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
        throw new Error("Failed to fetch available integrations")
      }
      const availableIntegrations = await availableResponse.json()

      // Fetch user's connected integrations
      const connectedResponse = await fetch("/api/integrations")
      if (!connectedResponse.ok) {
        throw new Error("Failed to fetch connected integrations")
      }
      const connectedIntegrations = await connectedResponse.json()

      // Merge available and connected integrations
      const mergedIntegrations = availableIntegrations.map((integration: any) => {
        const connected = connectedIntegrations.find((conn: any) => conn.provider === integration.id)
        return {
          ...integration,
          isConnected: !!connected,
          status: connected ? "connected" : "disconnected",
          connectedAt: connected?.created_at,
          lastSync: connected?.last_sync,
          error: connected?.error_message,
        }
      })

      setIntegrations(mergedIntegrations)
    } catch (err) {
      console.error("Error fetching integrations:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch integrations")
      toast({
        title: "Error",
        description: "Failed to load integrations. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [user])

  const connectIntegration = useCallback(async (providerId: string) => {
    try {
      setError(null)

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
      const response = await fetch("/api/integrations/oauth/generate-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider: providerId }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate OAuth URL")
      }

      const { authUrl } = await response.json()

      // Store return URL for after authorization
      const returnUrl = window.location.href
      localStorage.setItem("integration_return_url", returnUrl)

      // Redirect directly to OAuth provider
      window.location.href = authUrl
    } catch (err) {
      console.error("Error connecting integration:", err)
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
      console.error("Error disconnecting integration:", err)
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
