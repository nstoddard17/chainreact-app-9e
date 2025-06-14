"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Loader2, RefreshCw, AlertCircle } from "lucide-react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"

interface IntegrationCardProps {
  provider: any
}

export default function IntegrationCard({ provider }: IntegrationCardProps) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { connectIntegration, fetchIntegrations } = useIntegrationStore()
  const { toast } = useToast()

  const handleConnect = async () => {
    try {
      setIsConnecting(true)

      // Set a timeout to reset the connecting state if it takes too long
      const timeoutId = setTimeout(() => {
        setIsConnecting(false)
        toast({
          title: "Connection Timeout",
          description: "The connection is taking longer than expected. Please try again.",
          variant: "destructive",
        })
      }, 10000) // 10 second timeout

      await connectIntegration(provider.id)

      // Clear the timeout if successful
      clearTimeout(timeoutId)
    } catch (error: any) {
      console.error(`Failed to connect ${provider.name}:`, error)
      toast({
        title: "Connection Failed",
        description: error.message || `Failed to connect ${provider.name}`,
        variant: "destructive",
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

      // Get the current session for authentication
      const { data: session } = await supabase.auth.getSession()
      if (!session.session?.access_token) {
        throw new Error("No authentication token available")
      }

      const response = await fetch(`/api/integrations/${provider.integration.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to disconnect integration")
      }

      toast({
        title: "Integration Disconnected",
        description: `${provider.name} has been disconnected successfully`,
      })

      // Refresh the integrations list to update the UI
      await fetchIntegrations(true)
    } catch (error: any) {
      console.error(`Failed to disconnect ${provider.name}:`, error)
      toast({
        title: "Disconnection Failed",
        description: error.message || `Failed to disconnect ${provider.name}`,
        variant: "destructive",
      })
    } finally {
      setIsDisconnecting(false)
    }
  }

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
        throw new Error(result.error || "Failed to refresh integration")
      }

      toast({
        title: "Integration Refreshed",
        description: `${provider.name} connection has been refreshed`,
      })

      // Refresh the integrations list
      await fetchIntegrations(true)
    } catch (error: any) {
      console.error(`Failed to refresh ${provider.name}:`, error)
      toast({
        title: "Refresh Failed",
        description: error.message || `Failed to refresh ${provider.name}`,
        variant: "destructive",
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  // Format the last updated date
  const lastUpdated = provider.integration?.updated_at
    ? new Date(provider.integration.updated_at).toLocaleDateString()
    : null

  // Determine connection status
  const isConnected = provider.integration?.status === "connected"
  const hasError = provider.integration?.status === "error"
  const wasConnected = !!provider.integration && !isConnected

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
            ) : hasError ? (
              <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
                <AlertCircle className="w-3 h-3 mr-1" />
                Error
              </Badge>
            ) : wasConnected ? (
              <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">
                Disconnected
              </Badge>
            ) : !provider.isAvailable ? (
              <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">
                Coming Soon
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
                className="flex-1 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                onClick={handleDisconnect}
                disabled={isDisconnecting || isRefreshing}
              >
                {isDisconnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-white"
                onClick={handleRefresh}
                disabled={isDisconnecting || isRefreshing}
                title="Refresh connection"
              >
                {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </Button>
            </div>
          ) : hasError ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 bg-white"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isConnecting ? "Reconnecting..." : "Reconnect"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Remove
              </Button>
            </div>
          ) : wasConnected ? (
            <div className="flex gap-2">
              <Button variant="default" size="sm" className="flex-1" onClick={handleConnect} disabled={isConnecting}>
                {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isConnecting ? "Reconnecting..." : "Reconnect"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Remove
              </Button>
            </div>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={handleConnect}
              disabled={isConnecting || !provider.isAvailable}
            >
              {isConnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {!provider.isAvailable ? "Coming Soon" : isConnecting ? "Connecting..." : "Connect"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
