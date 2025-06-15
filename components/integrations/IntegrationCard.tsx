"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useToast } from "@/hooks/use-toast"
import { Loader2, CheckCircle, AlertCircle, Unplug } from "lucide-react"

interface IntegrationCardProps {
  provider: {
    id: string
    name: string
    description: string
    category: string
    icon: string
    color: string
    isAvailable: boolean
    capabilities?: string[]
    connected?: boolean
    integration?: any
  }
}

export default function IntegrationCard({ provider }: IntegrationCardProps) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const { toast } = useToast()

  const { connectIntegration, disconnectIntegration, getIntegrationStatus, getIntegrationByProvider, isLoading } =
    useIntegrationStore()

  // Get real-time status from store
  const integrationStatus = getIntegrationStatus(provider.id)
  const integration = getIntegrationByProvider(provider.id)
  const isConnected = integrationStatus === "connected"
  const hasError = integrationStatus === "error"

  const handleConnect = async () => {
    try {
      setIsConnecting(true)
      console.log(`🔗 Attempting to connect ${provider.name}...`)

      await connectIntegration(provider.id)

      toast({
        title: "Connecting...",
        description: `Redirecting to ${provider.name} for authorization...`,
        duration: 3000,
      })
    } catch (error: any) {
      console.error(`❌ Failed to connect ${provider.name}:`, error)

      let errorMessage = `Failed to connect ${provider.name}`

      if (error.message.includes("session has expired") || error.message.includes("log in")) {
        errorMessage = "Your session has expired. Please refresh the page and log in again."
      } else if (error.message.includes("not configured")) {
        errorMessage = `${provider.name} integration is not configured. Please contact support.`
      } else {
        errorMessage = error.message || `Failed to connect ${provider.name}. Please try again.`
      }

      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 7000,
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!integration?.id) {
      toast({
        title: "Error",
        description: "Integration ID not found",
        variant: "destructive",
      })
      return
    }

    try {
      setIsDisconnecting(true)
      console.log(`🔌 Attempting to disconnect ${provider.name}...`)

      await disconnectIntegration(integration.id)
    } catch (error: any) {
      console.error(`❌ Failed to disconnect ${provider.name}:`, error)
      // Error handling is done in the store
    } finally {
      setIsDisconnecting(false)
    }
  }

  const getStatusBadge = () => {
    if (isConnected) {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Connected
        </Badge>
      )
    }

    if (hasError) {
      return (
        <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          Error
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
        Not Connected
      </Badge>
    )
  }

  const getActionButton = () => {
    if (isConnected) {
      return (
        <Button
          onClick={handleDisconnect}
          disabled={isDisconnecting || isLoading}
          variant="outline"
          size="sm"
          className="w-full border-red-200 text-red-700 hover:bg-red-50"
        >
          {isDisconnecting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Disconnecting...
            </>
          ) : (
            <>
              <Unplug className="w-4 h-4 mr-2" />
              Disconnect
            </>
          )}
        </Button>
      )
    }

    return (
      <Button
        onClick={handleConnect}
        disabled={isConnecting || isLoading || !provider.isAvailable}
        size="sm"
        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
      >
        {isConnecting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Connecting...
          </>
        ) : (
          "Connect"
        )}
      </Button>
    )
  }

  return (
    <Card className="h-full transition-all duration-200 hover:shadow-md border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-semibold text-white"
              style={{ backgroundColor: provider.color }}
            >
              {provider.icon}
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900">{provider.name}</CardTitle>
              <Badge variant="outline" className="text-xs mt-1 bg-slate-50 text-slate-600 border-slate-200">
                {provider.category}
              </Badge>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <CardDescription className="text-sm text-slate-600 mb-4 line-clamp-2">{provider.description}</CardDescription>

        {provider.capabilities && provider.capabilities.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-1">
              {provider.capabilities.slice(0, 3).map((capability) => (
                <Badge
                  key={capability}
                  variant="outline"
                  className="text-xs bg-slate-50 text-slate-600 border-slate-200"
                >
                  {capability}
                </Badge>
              ))}
              {provider.capabilities.length > 3 && (
                <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200">
                  +{provider.capabilities.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {hasError && integration?.error_message && (
          <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {integration.error_message}
          </div>
        )}

        {isConnected && integration?.last_sync && (
          <div className="mb-4 text-xs text-slate-500">
            Last synced: {new Date(integration.last_sync).toLocaleDateString()}
          </div>
        )}

        <div className="space-y-2">
          {getActionButton()}

          {!provider.isAvailable && <p className="text-xs text-slate-500 text-center">Not configured</p>}
        </div>
      </CardContent>
    </Card>
  )
}
