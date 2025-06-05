"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle, ExternalLink, Settings, Unlink } from "lucide-react"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useToast } from "@/hooks/use-toast"

interface Provider {
  id: string
  name: string
  description: string
  icon: string
  logoColor: string
  authType: "oauth" | "api_key"
  scopes: string[]
  capabilities: string[]
  category: string
  requiresSetup?: boolean
  connected?: boolean
  wasConnected?: boolean
  integration?: any
  comingSoon?: boolean
}

interface IntegrationCardProps {
  provider: Provider
}

export default function IntegrationCard({ provider }: IntegrationCardProps) {
  const [isConnecting, setIsConnecting] = useState(false)
  const { connectIntegration, disconnectIntegration } = useIntegrationStore()
  const { toast } = useToast()

  const handleConnect = async () => {
    if (provider.comingSoon) {
      toast({
        title: "Coming Soon",
        description: `${provider.name} integration is coming soon! Stay tuned for updates.`,
      })
      return
    }

    setIsConnecting(true)
    try {
      await connectIntegration(provider.id, true)
    } catch (error: any) {
      console.error("Connection error:", error)
      toast({
        title: "Connection Failed",
        description: `Failed to connect to ${provider.name}: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const handleReconnect = async () => {
    if (!provider.integration?.id) return

    setIsConnecting(true)
    try {
      await connectIntegration(provider.id, true)
    } catch (error: any) {
      console.error("Reconnection error:", error)
      toast({
        title: "Reconnection Failed",
        description: `Failed to reconnect to ${provider.name}: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!provider.integration?.id) return

    if (confirm(`Are you sure you want to disconnect ${provider.name}?`)) {
      try {
        await disconnectIntegration(provider.integration.id)
        toast({
          title: "Integration Disconnected",
          description: `${provider.name} has been disconnected successfully.`,
        })
      } catch (error: any) {
        console.error("Disconnection error:", error)
        toast({
          title: "Disconnection Failed",
          description: `Failed to disconnect ${provider.name}: ${error.message}`,
          variant: "destructive",
        })
      }
    }
  }

  const getStatusIcon = () => {
    if (provider.connected) {
      return <CheckCircle className="h-4 w-4 text-green-500" />
    } else if (provider.integration?.status === "error") {
      return <AlertCircle className="h-4 w-4 text-red-500" />
    } else {
      return <AlertCircle className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = () => {
    if (provider.connected) {
      return (
        <Badge variant="default" className="bg-green-100 text-green-800">
          Connected
        </Badge>
      )
    } else if (provider.integration?.status === "error") {
      return <Badge variant="destructive">Error</Badge>
    } else if (provider.comingSoon) {
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
          Coming Soon
        </Badge>
      )
    } else {
      return <Badge variant="secondary">Not Connected</Badge>
    }
  }

  return (
    <Card className={`w-full ${provider.comingSoon ? "opacity-75" : ""}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <CardTitle className="text-sm font-medium">{provider.name}</CardTitle>
        </div>
        {getStatusBadge()}
      </CardHeader>
      <CardContent>
        <CardDescription className="text-xs text-muted-foreground mb-4">{provider.description}</CardDescription>

        {provider.connected && provider.integration?.metadata && (
          <div className="text-xs text-muted-foreground mb-4">
            <p>
              Connected as:{" "}
              {provider.integration.metadata.user_name ||
                provider.integration.metadata.username ||
                provider.integration.metadata.display_name ||
                "Unknown"}
            </p>
            {provider.integration.connected_at && (
              <p>Connected: {new Date(provider.integration.connected_at).toLocaleDateString()}</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {provider.connected ? (
            <>
              <Button size="sm" variant="outline" onClick={handleReconnect} disabled={isConnecting} className="flex-1">
                <Settings className="h-3 w-3 mr-1" />
                {isConnecting ? "Reconnecting..." : "Reconnect"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleDisconnect} className="flex-1">
                <Unlink className="h-3 w-3 mr-1" />
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={handleConnect} disabled={isConnecting || provider.comingSoon} className="flex-1">
              <ExternalLink className="h-3 w-3 mr-1" />
              {isConnecting ? "Connecting..." : "Connect"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
