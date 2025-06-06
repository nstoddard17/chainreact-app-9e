"use client"

import type React from "react"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useIntegrationStore } from "@/stores/integrationStore"
import { CheckCircle2, Loader2, Settings, ExternalLink, AlertCircle, Zap, Shield, Clock } from "lucide-react"

interface Provider {
  id: string
  name: string
  description: string
  category: string
  logoUrl: string
  capabilities: string[]
  scopes: string[]
  isAvailable: boolean
}

interface Integration {
  id: string
  provider: string
  status: "connected" | "disconnected" | "error"
  created_at: string
  updated_at: string
}

interface ProviderWithStatus extends Provider {
  connected: boolean
  wasConnected: boolean
  integration: Integration | null
}

interface IntegrationCardProps {
  provider: ProviderWithStatus
}

const IntegrationCard: React.FC<IntegrationCardProps> = ({ provider }) => {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const { connectIntegration, disconnectIntegration } = useIntegrationStore()

  const handleConnect = async () => {
    setIsLoading(true)
    try {
      await connectIntegration(provider.id)
    } catch (error: any) {
      console.error("Failed to connect:", error)
      toast({
        title: "Connection Failed",
        description: error.message || `Failed to connect to ${provider.name}`,
        variant: "destructive",
        duration: 5000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!provider.integration) return

    setIsLoading(true)
    try {
      await disconnectIntegration(provider.integration.id)
      toast({
        title: "Disconnected",
        description: `${provider.name} has been disconnected`,
        duration: 3000,
      })
    } catch (error: any) {
      console.error("Failed to disconnect:", error)
      toast({
        title: "Disconnection Failed",
        description: error.message || `Failed to disconnect ${provider.name}`,
        variant: "destructive",
        duration: 5000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfigure = () => {
    // TODO: Open configuration modal or navigate to settings
    toast({
      title: "Configuration",
      description: `${provider.name} configuration coming soon`,
      duration: 3000,
    })
  }

  const getStatusBadge = () => {
    if (provider.connected) {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Connected
        </Badge>
      )
    }

    if (provider.wasConnected) {
      return (
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          <Clock className="w-3 h-3 mr-1" />
          Disconnected
        </Badge>
      )
    }

    if (!provider.isAvailable) {
      return (
        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          Coming Soon
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        <Zap className="w-3 h-3 mr-1" />
        Available
      </Badge>
    )
  }

  const getActionButton = () => {
    if (!provider.isAvailable) {
      return (
        <Button disabled variant="outline" className="w-full">
          Coming Soon
        </Button>
      )
    }

    if (provider.connected) {
      return (
        <div className="flex gap-2">
          <Button onClick={handleConfigure} variant="outline" size="sm" className="flex-1" disabled={isLoading}>
            <Settings className="w-4 h-4 mr-2" />
            Configure
          </Button>
          <Button
            onClick={handleDisconnect}
            variant="outline"
            size="sm"
            className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disconnect"}
          </Button>
        </div>
      )
    }

    return (
      <Button onClick={handleConnect} className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <ExternalLink className="w-4 h-4 mr-2" />
            Connect
          </>
        )}
      </Button>
    )
  }

  return (
    <Card className="h-full hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage
                src={provider.logoUrl || `/placeholder.svg?height=40&width=40&text=${provider.name.charAt(0)}`}
                alt={`${provider.name} Logo`}
              />
              <AvatarFallback className="text-sm font-medium">
                {provider.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg font-semibold truncate">{provider.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {provider.category}
                </Badge>
                {getStatusBadge()}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <CardDescription className="text-sm text-gray-600 line-clamp-2">{provider.description}</CardDescription>

        {/* Capabilities */}
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-xs font-medium text-gray-700">
            <Shield className="w-3 h-3" />
            Capabilities
          </div>
          <div className="flex flex-wrap gap-1">
            {provider.capabilities.slice(0, 4).map((capability) => (
              <Badge key={capability} variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200">
                {capability}
              </Badge>
            ))}
            {provider.capabilities.length > 4 && (
              <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200">
                +{provider.capabilities.length - 4} more
              </Badge>
            )}
          </div>
        </div>

        {/* Connection Info */}
        {provider.integration && (
          <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
            Connected on {new Date(provider.integration.created_at).toLocaleDateString()}
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2">{getActionButton()}</div>
      </CardContent>
    </Card>
  )
}

export default IntegrationCard
