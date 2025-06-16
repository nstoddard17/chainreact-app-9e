"use client"

import { useState, useCallback, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Loader2, RefreshCw, ExternalLink, AlertCircle } from "lucide-react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useToast } from "@/hooks/use-toast"
import RedirectLoadingOverlay from "./RedirectLoadingOverlay"

interface IntegrationCardProps {
  provider: {
    id: string
    name: string
    description: string
    logoUrl?: string
    capabilities: string[]
    connected?: boolean
    wasConnected?: boolean
    isAvailable: boolean
    integration?: {
      id: string
      updated_at: string
      status: string
    }
  }
}

export default function IntegrationCard({ provider }: IntegrationCardProps) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const {
    connectIntegration,
    disconnectIntegration,
    fetchIntegrations,
    getIntegrationStatus,
    getIntegrationByProvider,
    debugInfo,
  } = useIntegrationStore()
  const { toast } = useToast()

  // Get real-time integration status
  const integrationStatus = getIntegrationStatus(provider.id)
  const integration = getIntegrationByProvider(provider.id)
  const isConnected = integrationStatus === "connected"
  const wasConnected = integration && integration.status === "disconnected"

  // Replace the debug logging useEffect with this:
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log(`🔍 IntegrationCard for ${provider.name}:`, {
        providerId: provider.id,
        integrationStatus,
        isConnected,
      })
    }
  }, [provider.id, provider.name, integrationStatus, isConnected])

  const handleConnect = useCallback(async () => {
    try {
      setIsConnecting(true)
      // Persist connecting state in case the user navigates away
      localStorage.setItem("integration_connecting", provider.id)
      localStorage.setItem("integration_connecting_time", Date.now().toString())

      // Show immediate feedback
      toast({
        title: "Redirecting to Authorization",
        description: `You'll be redirected to ${provider.name} to authorize the connection.`,
        duration: 3000,
      })

      await connectIntegration(provider.id)
      // Note: This won't execute as we redirect immediately in connectIntegration
    } catch (error: any) {
      console.error(`Failed to connect ${provider.name}:`, error)

      let errorMessage = error.message || `Failed to connect ${provider.name}`

      if (error.message?.includes("not configured")) {
        errorMessage = `${provider.name} integration is not configured. Please contact support.`
      }

      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 8000,
      })
      setIsConnecting(false)
      localStorage.removeItem("integration_connecting")
      localStorage.removeItem("integration_connecting_time")
    }
  }, [provider, connectIntegration, toast])

  const handleDisconnect = useCallback(async () => {
    if (!integration?.id) {
      toast({
        title: "Error",
        description: "No integration found to disconnect",
        variant: "destructive",
      })
      return
    }

    try {
      setIsDisconnecting(true)

      await disconnectIntegration(integration.id)

      toast({
        title: "Integration Disconnected",
        description: `${provider.name} has been disconnected successfully`,
        duration: 4000,
      })

      // Refresh the integrations list
      await fetchIntegrations(true)
    } catch (error: any) {
      console.error(`Failed to disconnect ${provider.name}:`, error)
      toast({
        title: "Disconnection Failed",
        description: error.message || `Failed to disconnect ${provider.name}`,
        variant: "destructive",
        duration: 8000,
      })
    } finally {
      setIsDisconnecting(false)
    }
  }, [provider, integration, disconnectIntegration, fetchIntegrations, toast])

  const handleRefresh = useCallback(async () => {
    if (!integration?.id) {
      toast({
        title: "Error",
        description: "No integration found to refresh",
        variant: "destructive",
      })
      return
    }

    try {
      setIsRefreshing(true)

      const response = await fetch("/api/integrations/oauth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider.id,
          integrationId: integration.id,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        if (result.error?.includes("requires re-authentication") || result.error?.includes("expired")) {
          toast({
            title: "Reconnection Required",
            description: `${provider.name} needs to be reconnected. Please disconnect and connect again.`,
            variant: "destructive",
            duration: 8000,
          })
        } else {
          throw new Error(result.error || "Failed to refresh integration")
        }
        return
      }

      toast({
        title: "Integration Refreshed",
        description: `${provider.name} connection has been refreshed successfully`,
        duration: 4000,
      })

      await fetchIntegrations(true)
    } catch (error: any) {
      console.error(`Failed to refresh ${provider.name}:`, error)

      let errorMessage = error.message || `Failed to refresh ${provider.name}`

      if (error.message?.includes("authentication") || error.message?.includes("expired")) {
        errorMessage = `${provider.name} authentication expired. Please reconnect your account.`
      }

      toast({
        title: "Refresh Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 8000,
      })
    } finally {
      setIsRefreshing(false)
    }
  }, [provider, integration, fetchIntegrations, toast])

  // Format the last updated date
  const lastUpdated = integration?.updated_at ? new Date(integration.updated_at).toLocaleDateString() : null

  // Add this after the existing useEffect hooks
  useEffect(() => {
    const connectingProvider = localStorage.getItem("integration_connecting")
    if (connectingProvider === provider.id) {
      // Check if this is a fresh page load vs an actual connection attempt
      const pageLoadTime = Date.now()
      const connectionStartTime = localStorage.getItem("integration_connecting_time")

      if (!connectionStartTime || pageLoadTime - Number.parseInt(connectionStartTime) > 30000) {
        // If no timestamp or more than 30 seconds old, clear it
        localStorage.removeItem("integration_connecting")
        localStorage.removeItem("integration_connecting_time")
        setIsConnecting(false)
      } else {
        setIsConnecting(true)
      }
    }
  }, [provider.id])

  const handleOauthMessage = useCallback(
    (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.provider !== provider.id) return

      if (event.data?.type === "oauth-success" || event.data?.type === "oauth-error") {
        localStorage.removeItem("integration_connecting")
        localStorage.removeItem("integration_connecting_time")
        setIsConnecting(false)
      }
    },
    [provider.id, setIsConnecting],
  )

  // Listen for OAuth success/error messages from the popup
  useEffect(() => {
    window.addEventListener("message", handleOauthMessage)
    return () => window.removeEventListener("message", handleOauthMessage)
  }, [handleOauthMessage])

  const getStatusBadge = () => {
    if (isConnected) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Connected
        </Badge>
      )
    }

    if (wasConnected) {
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          Disconnected
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">
        Not Connected
      </Badge>
    )
  }

  const showRedirectOverlay = isConnecting && !isDisconnecting && !isRefreshing

  return (
    <Card className="overflow-hidden border border-slate-200 transition-all hover:shadow-md group">
      <CardContent className="p-0">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center overflow-hidden">
                <img
                  src={provider.logoUrl || "/placeholder.svg"}
                  alt={`${provider.name} logo`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = "/placeholder.svg?height=40&width=40&text=" + provider.name.charAt(0)
                  }}
                />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 group-hover:text-slate-700 transition-colors">
                  {provider.name}
                </h3>
                {isConnected && (
                  <div className="flex items-center text-xs text-slate-500">
                    <RefreshCw className="w-3 h-3 mr-1" />
                    {lastUpdated ? `Updated ${lastUpdated}` : "Connected"}
                  </div>
                )}
              </div>
            </div>
            {getStatusBadge()}
          </div>

          <p className="text-sm text-slate-600 mb-4 line-clamp-2">{provider.description}</p>

          <div className="flex flex-wrap gap-2 mb-4">
            {provider.capabilities?.slice(0, 3).map((capability: string) => (
              <Badge
                key={capability}
                variant="outline"
                className="bg-slate-50 text-slate-700 border-slate-200 text-xs font-normal"
              >
                {capability}
              </Badge>
            ))}
            {provider.capabilities?.length > 3 && (
              <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-xs font-normal">
                +{provider.capabilities.length - 3} more
              </Badge>
            )}
          </div>

          {/* Debug info in development */}
          {process.env.NODE_ENV === "development" && (
            <div className="text-xs text-slate-400 mb-2 font-mono">
              Status: {integrationStatus} | ID: {integration?.id || "none"}
            </div>
          )}
        </div>

        <div className="bg-slate-50 p-4 border-t border-slate-200">
          {isConnected ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors"
                onClick={handleDisconnect}
                disabled={isDisconnecting || isRefreshing}
              >
                {isDisconnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-white hover:bg-blue-50 hover:border-blue-200 transition-colors"
                onClick={handleRefresh}
                disabled={isDisconnecting || isRefreshing}
                title="Refresh connection"
              >
                {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                className="flex-1 transition-colors"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
              {!isConnected && (
                <Button variant="ghost" size="sm" className="px-2 hover:bg-slate-100" title="Learn more">
                  <ExternalLink className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
      {showRedirectOverlay && <RedirectLoadingOverlay provider={provider.name} isVisible={showRedirectOverlay} />}
    </Card>
  )
}
