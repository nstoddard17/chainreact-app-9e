"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react"
import { useIntegrationStore } from "@/stores/integrationStore"
import IntegrationStatus from "./IntegrationStatus"
import { useToast } from "@/hooks/use-toast"

interface Provider {
  id: string
  name: string
  description: string
  icon: string
  category: string
  capabilities: string[]
  connected?: boolean
  wasConnected?: boolean
  integration?: any
}

interface IntegrationCardProps {
  provider: Provider
}

export default function IntegrationCard({ provider }: IntegrationCardProps) {
  const [connecting, setConnecting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const { connectIntegration, disconnectIntegration, refreshIntegration } = useIntegrationStore()
  const { toast } = useToast()

  const handleConnect = async () => {
    try {
      setConnecting(true)
      await connectIntegration(provider.id)
    } catch (err: any) {
      console.error("Failed to connect integration:", err)
      toast({
        title: "Connection Failed",
        description: err.message || "Could not connect to integration. Please try again.",
        variant: "destructive",
      })
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      setConnecting(true)
      await disconnectIntegration(provider.integration?.id)
      toast({
        title: "Integration Disconnected",
        description: `${provider.name} has been disconnected.`,
      })
    } catch (err: any) {
      console.error("Failed to disconnect integration:", err)
      toast({
        title: "Disconnect Failed",
        description: err.message || "Could not disconnect integration. Please try again.",
        variant: "destructive",
      })
    } finally {
      setConnecting(false)
    }
  }

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      await refreshIntegration(provider.id, provider.integration?.id)
      toast({
        title: "Integration Refreshed",
        description: `${provider.name} connection has been refreshed.`,
      })
    } catch (err: any) {
      console.error("Failed to refresh integration:", err)
      toast({
        title: "Refresh Failed",
        description: err.message || "Could not refresh integration. Please try again.",
        variant: "destructive",
      })
    } finally {
      setRefreshing(false)
    }
  }

  // Fix: Properly check if token is expired or expiring soon
  const isExpired = provider.integration?.expires_at
    ? new Date(provider.integration.expires_at).getTime() < Date.now()
    : false

  const isExpiringSoon = provider.integration?.expires_at
    ? new Date(provider.integration.expires_at).getTime() - Date.now() < 24 * 60 * 60 * 1000 // 24 hours
    : false

  // Check if there are scope validation issues
  const hasScopeIssues =
    provider.integration?.scope_validation_status === "invalid" ||
    provider.integration?.scope_validation_status === "partial"

  return (
    <Card className="overflow-hidden border border-slate-200 transition-all hover:shadow-md">
      <CardContent className="p-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-md bg-slate-100">
                {provider.icon ? (
                  <img
                    src={provider.icon || "/placeholder.svg"}
                    alt={`${provider.name} icon`}
                    className="w-5 h-5 object-contain"
                    onError={(e) => {
                      e.currentTarget.src = "/placeholder.svg?height=20&width=20"
                    }}
                  />
                ) : (
                  <div className="w-5 h-5 bg-slate-300 rounded" />
                )}
              </div>
              <div>
                <h3 className="font-medium text-slate-900">{provider.name}</h3>
                {provider.connected && (
                  <IntegrationStatus
                    status={provider.integration?.status || "unknown"}
                    expiresAt={provider.integration?.expires_at}
                    lastRefresh={provider.integration?.last_token_refresh}
                    className="mt-1"
                  />
                )}
              </div>
            </div>

            {hasScopeIssues && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                Scope Issues
              </Badge>
            )}
          </div>

          {/* Body */}
          <div className="p-4 flex-1 flex flex-col">
            <p className="text-sm text-slate-600 mb-4 flex-1">{provider.description}</p>

            {/* Capabilities */}
            <div className="mb-4">
              <div className="flex flex-wrap gap-1.5">
                {provider.capabilities.slice(0, 3).map((capability, index) => (
                  <Badge key={index} variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200">
                    {capability}
                  </Badge>
                ))}
                {provider.capabilities.length > 3 && (
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200">
                    +{provider.capabilities.length - 3} more
                  </Badge>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center mt-auto">
              {provider.connected ? (
                <div className="flex gap-2 w-full">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-slate-200 text-slate-700 hover:bg-slate-50"
                    onClick={handleDisconnect}
                    disabled={connecting || refreshing}
                  >
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disconnect"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-slate-200 text-slate-700 hover:bg-slate-50 px-2"
                    onClick={handleRefresh}
                    disabled={connecting || refreshing}
                    title="Refresh connection"
                  >
                    {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </Button>
                </div>
              ) : (
                <Button
                  variant={provider.wasConnected ? "outline" : "default"}
                  size="sm"
                  className={
                    provider.wasConnected
                      ? "w-full border-slate-200 text-slate-700 hover:bg-slate-50"
                      : "w-full bg-blue-600 hover:bg-blue-700 text-white"
                  }
                  onClick={handleConnect}
                  disabled={connecting}
                >
                  {connecting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : provider.wasConnected ? (
                    "Reconnect"
                  ) : (
                    "Connect"
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
