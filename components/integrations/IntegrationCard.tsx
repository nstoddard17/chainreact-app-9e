"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useIntegrationStore } from "@/stores/integrationStore"
import { RedirectLoadingOverlay } from "./RedirectLoadingOverlay"
import { Loader2, CheckCircle, AlertCircle, RefreshCw } from "lucide-react"

interface IntegrationCardProps {
  provider: {
    id: string
    name: string
    description: string
    icon: string
    category: string
    isConnected: boolean
    isAvailable: boolean
    connectedAt?: string
    lastSync?: string
    status: "connected" | "disconnected" | "error" | "syncing"
    scopes?: string[]
    requiredScopes?: string[]
    scopesValid?: boolean
  }
}

export default function IntegrationCard({ provider }: IntegrationCardProps) {
  const { toast } = useToast()
  const { connectIntegration, disconnectIntegration, refreshIntegration, loadingStates } = useIntegrationStore()
  const [isRedirecting, setIsRedirecting] = useState(false)

  const isConnecting = loadingStates[`connect-${provider.id}`] || false
  const isDisconnecting = loadingStates[`disconnect-${provider.id}`] || false
  const isRefreshing = loadingStates[`refresh-${provider.id}`] || false

  const handleConnect = async () => {
    try {
      setIsRedirecting(true)
      await connectIntegration(provider.id)

      toast({
        title: "Integration Connected",
        description: `${provider.name} has been connected successfully`,
        duration: 4000,
      })
    } catch (err: any) {
      toast({
        title: "Connection Failed",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setIsRedirecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnectIntegration(provider.id)

      toast({
        title: "Integration Disconnected",
        description: `${provider.name} has been disconnected`,
      })
    } catch (err: any) {
      toast({
        title: "Disconnection Failed",
        description: err.message,
        variant: "destructive",
      })
    }
  }

  const handleRefresh = async () => {
    try {
      await refreshIntegration(provider.id)

      toast({
        title: "Integration Refreshed",
        description: `${provider.name} connection has been refreshed`,
      })
    } catch (err: any) {
      toast({
        title: "Refresh Failed",
        description: err.message,
        variant: "destructive",
      })
    }
  }

  const getStatusIcon = () => {
    switch (provider.status) {
      case "connected":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case "syncing":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      default:
        return null
    }
  }

  const getStatusBadge = () => {
    if (!provider.isAvailable) {
      return <Badge variant="secondary">Not Configured</Badge>
    }

    switch (provider.status) {
      case "connected":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            Connected
          </Badge>
        )
      case "error":
        return <Badge variant="destructive">Error</Badge>
      case "syncing":
        return <Badge variant="secondary">Syncing</Badge>
      default:
        return <Badge variant="outline">Disconnected</Badge>
    }
  }

  return (
    <>
      <Card className="relative">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
              <span className="text-sm font-semibold">{provider.icon}</span>
            </div>
            <div>
              <CardTitle className="text-base">{provider.name}</CardTitle>
              <div className="flex items-center space-x-2 mt-1">
                {getStatusIcon()}
                {getStatusBadge()}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <CardDescription className="mb-4">{provider.description}</CardDescription>

          {provider.connectedAt && (
            <p className="text-xs text-muted-foreground mb-2">
              Connected: {new Date(provider.connectedAt).toLocaleDateString()}
            </p>
          )}

          {provider.lastSync && (
            <p className="text-xs text-muted-foreground mb-4">
              Last sync: {new Date(provider.lastSync).toLocaleDateString()}
            </p>
          )}

          <div className="flex space-x-2">
            {!provider.isConnected ? (
              <Button
                onClick={handleConnect}
                disabled={!provider.isAvailable || isConnecting || isRedirecting}
                className="flex-1"
              >
                {isConnecting || isRedirecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            ) : (
              <>
                <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline" size="sm">
                  {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
                <Button
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                >
                  {isDisconnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Disconnecting...
                    </>
                  ) : (
                    "Disconnect"
                  )}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <RedirectLoadingOverlay provider={provider.name} isVisible={isRedirecting} />
    </>
  )
}
