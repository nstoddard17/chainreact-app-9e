"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Loader2, RefreshCw, AlertTriangle } from "lucide-react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useToast } from "@/hooks/use-toast"

interface IntegrationCardProps {
  provider: any
}

export default function IntegrationCard({ provider }: IntegrationCardProps) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { connectIntegration, fetchIntegrations, disconnectIntegration } = useIntegrationStore()
  const { toast } = useToast()

  // Update handleConnect with better error handling and user feedback
  const handleConnect = async () => {
    try {
      setIsConnecting(true)

      // Clear any previous timeout
      const timeoutId = setTimeout(() => {
        setIsConnecting(false)
        toast({
          title: "Connection Taking Longer Than Expected",
          description:
            "The connection is taking longer than usual. Please check if a new tab opened for authorization.",
          variant: "destructive",
          duration: 8000,
        })
      }, 15000) // 15 second timeout

      await connectIntegration(provider.id)

      toast({
        title: "Authorization Started",
        description: `Opening ${provider.name} authorization. Please complete the process in the new tab and return here.`,
        duration: 6000,
      })

      // Set up connection monitoring
      const checkConnection = async () => {
        try {
          await fetchIntegrations(true)
          // Check if this provider is now connected
          const updatedProvider = await fetchIntegrations(true)
          // The component will re-render with updated status
          clearTimeout(timeoutId)
          setIsConnecting(false)
          return true
        } catch (error) {
          console.error("Error checking connection:", error)
          return false
        }
      }

      // Monitor for connection completion
      const monitorConnection = () => {
        const intervalId = setInterval(async () => {
          const connected = await checkConnection()
          if (connected) {
            clearInterval(intervalId)
            clearTimeout(timeoutId)
          }
        }, 3000)

        // Stop monitoring after 3 minutes
        setTimeout(() => {
          clearInterval(intervalId)
          clearTimeout(timeoutId)
          setIsConnecting(false)
        }, 180000)
      }

      // Start monitoring after a short delay
      setTimeout(monitorConnection, 2000)
    } catch (error: any) {
      console.error(`Failed to connect ${provider.name}:`, error)

      let errorMessage = error.message || `Failed to connect ${provider.name}`

      if (error.message?.includes("popup")) {
        errorMessage = "Please allow popups for this site to connect integrations"
      } else if (error.message?.includes("not configured")) {
        errorMessage = `${provider.name} integration is not configured. Please contact support.`
      }

      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 8000,
      })
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!provider.integration?.id) {
      toast({
        title: "Error",
        description: "No integration found to disconnect",
        variant: "destructive",
      })
      return
    }

    try {
      setIsDisconnecting(true)
      await disconnectIntegration(provider.id)

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
  }

  // Update handleRefresh with better error handling
  const handleRefresh = async () => {
    if (!provider.integration?.id) {
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: provider.id,
          integrationId: provider.integration.id,
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

      // Refresh the integrations list
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
  }

  // Format the last updated date
  const lastUpdated = provider.integration?.updated_at
    ? new Date(provider.integration.updated_at).toLocaleDateString()
    : null

  // Check if the integration is actually connected
  const isConnected = provider.connected && provider.integration?.status === "connected"
  const hasIntegration = !!provider.integration
  const canConnect = provider.isAvailable !== false // Allow connection unless explicitly disabled
  const canDisconnect = isConnected && hasIntegration

  return (
    <Card className="overflow-hidden border border-slate-200 transition-all hover:shadow-md">
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
                <h3 className="font-semibold text-slate-900">{provider.name}</h3>
                {isConnected && (
                  <div className="flex items-center text-xs text-slate-500">
                    <RefreshCw className="w-3 h-3 mr-1" />
                    {lastUpdated ? `Updated ${lastUpdated}` : "Connected"}
                  </div>
                )}
              </div>
            </div>
            {isConnected ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">
                <CheckCircle className="w-3 h-3 mr-1" />
                Connected
              </Badge>
            ) : provider.wasConnected ? (
              <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">
                Disconnected
              </Badge>
            ) : provider.isAvailable === false ? (
              <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Not Configured
              </Badge>
            ) : null}
          </div>

          <p className="text-sm text-slate-600 mb-4 line-clamp-2">{provider.description}</p>

          <div className="flex flex-wrap gap-2 mb-4">
            {provider.capabilities.slice(0, 3).map((capability: string) => (
              <Badge
                key={capability}
                variant="outline"
                className="bg-slate-50 text-slate-700 border-slate-200 text-xs font-normal"
              >
                {capability}
              </Badge>
            ))}
            {provider.capabilities.length > 3 && (
              <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-xs font-normal">
                +{provider.capabilities.length - 3} more
              </Badge>
            )}
          </div>
        </div>

        <div className="bg-slate-50 p-4 border-t border-slate-200">
          {isConnected ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                onClick={handleDisconnect}
                disabled={isDisconnecting || isRefreshing}
              >
                {isDisconnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-white hover:bg-blue-50 hover:border-blue-200"
                onClick={handleRefresh}
                disabled={isDisconnecting || isRefreshing}
                title="Refresh connection"
              >
                {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </Button>
            </div>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={handleConnect}
              disabled={isConnecting || !canConnect}
            >
              {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {!canConnect ? "Not Configured" : isConnecting ? "Connecting..." : "Connect"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
