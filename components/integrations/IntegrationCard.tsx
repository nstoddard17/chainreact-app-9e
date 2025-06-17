"use client"

import { useState, useCallback, useEffect } from "react"
import Image from "next/image"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Loader2, RefreshCw, ExternalLink, AlertCircle, X } from "lucide-react"
import { useIntegrationStore, type Integration, type Provider } from "@/stores/integrationStore"
import { useToast } from "@/hooks/use-toast"
import RedirectLoadingOverlay from "./RedirectLoadingOverlay"

interface IntegrationCardProps {
  provider: Provider
  connected: boolean
  wasConnected: boolean
  isAvailable: boolean
  integration: Integration | null
  onConnecting: () => void
}

export default function IntegrationCard({
  provider,
  connected,
  wasConnected,
  isAvailable,
  integration,
  onConnecting,
}: IntegrationCardProps) {
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
  const isConnected = connected

  // Replace the debug logging useEffect with this:
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log(`🔍 IntegrationCard for ${provider.name}:`, {
        providerId: provider.id,
        isConnected,
      })
    }
  }, [provider.id, provider.name, isConnected])

  const handleConnect = useCallback(async () => {
    if (!isAvailable) {
      toast({
        title: "Integration Not Available",
        description: `${provider.name} is not configured correctly. Please check environment variables.`,
        variant: "destructive",
      })
      return
    }
    setIsConnecting(true)
    onConnecting()
    try {
      await connectIntegration(provider.id)
    } catch (error: any) {
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive",
      })
      setIsConnecting(false)
    }
  }, [provider.id, isAvailable, connectIntegration, onConnecting, toast, provider.name])

  const handleDisconnect = useCallback(async () => {
    if (!integration?.id) return
    setIsDisconnecting(true)
    try {
      await disconnectIntegration(integration.id)
      toast({
        title: "Integration Disconnected",
        description: `${provider.name} has been disconnected.`,
      })
    } catch (error: any) {
      toast({
        title: "Disconnection Failed",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsDisconnecting(false)
    }
  }, [integration?.id, disconnectIntegration, toast, provider.name])

  const handleRefresh = useCallback(async () => {
    if (!integration?.id) return
    setIsRefreshing(true)
    try {
      // Assuming a refresh endpoint exists
      const response = await fetch('/api/integrations/refresh-token', {
        method: 'POST',
        body: JSON.stringify({ integrationId: integration.id }),
        headers: { "Content-Type": "application/json" },
      })
      if (!response.ok) throw new Error("Failed to refresh token.")
      await fetchIntegrations(true)
      toast({
        title: "Connection Refreshed",
        description: `${provider.name} connection has been successfully refreshed.`,
      })
    } catch (error: any) {
      toast({
        title: "Refresh Failed",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsRefreshing(false)
    }
  }, [integration?.id, fetchIntegrations, toast, provider.name])

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
        if (event.data?.type === "oauth-success") {
          const retryFetchUntilConnected = async (providerId: string, maxTries = 6) => {
            for (let i = 0; i < maxTries; i++) {
              await fetchIntegrations(true)
              const integration = getIntegrationByProvider(providerId)
              if (integration?.status === "connected") return
              await new Promise((res) => setTimeout(res, (i + 1) * 1000)) // 1s, 2s, 3s, ...
            }
          }

          retryFetchUntilConnected(provider.id)
        }
      }
    },
    [provider.id, setIsConnecting, fetchIntegrations, getIntegrationByProvider, provider.id],
  )

  // Listen for OAuth success/error messages from the popup
  useEffect(() => {
    window.addEventListener("message", handleOauthMessage)
    return () => window.removeEventListener("message", handleOauthMessage)
  }, [handleOauthMessage])

  useEffect(() => {
    // This effect handles the case where the popup is closed or redirects back.
    // We'll reset the connecting state if we find the integration is connected.
    if (isConnecting && connected) {
      setIsConnecting(false)
    }
  }, [connected, isConnecting])

  const getStatus = () => {
    if (!connected) return { text: "Disconnected", color: "bg-gray-200 text-gray-800" }
    if (integration?.expires_at) {
      const expiresIn = new Date(integration.expires_at).getTime() - Date.now()
      const sevenDays = 7 * 24 * 60 * 60 * 1000
      if (expiresIn < sevenDays) {
        return { text: "Expiring Soon", color: "bg-yellow-100 text-yellow-800" }
      }
    }
    return { text: "Connected", color: "bg-green-100 text-green-800" }
  }

  const status = getStatus()

  const showRedirectOverlay = isConnecting && !isDisconnecting && !isRefreshing

  return (
    <Card className="flex flex-col justify-between p-4">
      <CardHeader className="flex flex-row items-center justify-between p-2">
        <div className="flex items-center gap-3">
          {provider.logoUrl && <Image src={provider.logoUrl} alt={`${provider.name} logo`} width={32} height={32} />}
          <CardTitle className="text-lg font-semibold">{provider.name}</CardTitle>
        </div>
        <Badge className={`px-2 py-1 text-xs font-medium rounded-full ${status.color}`}>{status.text}</Badge>
      </CardHeader>
      <CardContent className="p-2">
        {/* Description or other info can go here if needed in the future */}
      </CardContent>
      <CardFooter className="p-2">
        {connected ? (
          <div className="flex w-full items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="flex-grow"
            >
              {isDisconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
              Disconnect
            </Button>
            <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          <Button onClick={handleConnect} disabled={isConnecting || !isAvailable} className="w-full">
            {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect
          </Button>
        )}
      </CardFooter>
      {showRedirectOverlay && <RedirectLoadingOverlay provider={provider.name} isVisible={showRedirectOverlay} />}
    </Card>
  )
}
