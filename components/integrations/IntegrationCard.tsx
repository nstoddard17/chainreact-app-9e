"use client"

import { useState } from "react"
import Image from "next/image"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Link as LinkIcon, Link2Off, RefreshCw } from "lucide-react"
import { useIntegrationStore, type Integration, type Provider } from "@/stores/integrationStore"
import { cn } from "@/lib/utils"

// Colors for the letter avatar
const avatarColors = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-red-500",
  "bg-yellow-500",
  "bg-teal-500",
]

const getAvatarColor = (name: string) => {
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return avatarColors[index % avatarColors.length]
}

interface IntegrationCardProps {
  provider: Provider
  integration: Integration | null
  status: 'connected' | 'expiring' | 'disconnected' | 'expired'
}

export function IntegrationCard({ provider, integration, status }: IntegrationCardProps) {
  const { connectIntegration, disconnectIntegration, reconnectIntegration, loadingStates } = useIntegrationStore()
  const [imageError, setImageError] = useState(false)

  const handleConnect = () => {
    connectIntegration(provider.id)
  }

  const handleDisconnect = () => {
    if (integration) {
      disconnectIntegration(integration.id)
    }
  }

  const handleReconnect = () => {
    if (integration) {
      reconnectIntegration(integration.id)
    }
  }

  const isLoading = 
    loadingStates[`connect-${provider.id}`] || 
    (integration ? loadingStates[`disconnect-${integration.provider}`] : false)

  const getStatusUi = () => {
    switch (status) {
      case 'connected':
        return {
          text: 'Connected',
          badgeClass: 'bg-green-100 text-green-800',
          action: 'disconnect'
        }
      case 'expired':
        return {
          text: 'Expired',
          badgeClass: 'bg-red-100 text-red-800',
          action: 'reconnect'
        }
      case 'expiring':
        const expiresAt = integration?.expires_at ? new Date(integration.expires_at) : null
        const now = new Date()
        const diffMs = expiresAt ? expiresAt.getTime() - now.getTime() : 0
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        const timeText = diffHours > 0 ? `${diffHours}h ${diffMinutes}m` : `${diffMinutes}m`
        return {
          text: `Expiring in ${timeText}`,
          badgeClass: 'bg-yellow-100 text-yellow-800',
          action: 'reconnect'
        }
      default: // disconnected
        return {
          text: 'Disconnected',
          badgeClass: 'bg-gray-100 text-gray-800',
          action: 'connect'
        }
    }
  }

  const { text: statusText, badgeClass, action: statusAction } = getStatusUi()

  const renderButton = () => {
    switch (statusAction) {
      case 'connect':
        return (
          <Button onClick={handleConnect} disabled={isLoading} size="sm" className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
            Connect
          </Button>
        )
      case 'disconnect':
        return (
          <Button
            onClick={handleDisconnect}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className="w-full bg-white text-gray-700 hover:bg-gray-100"
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2Off className="mr-2 h-4 w-4" />}
            Disconnect
          </Button>
        )
      case 'reconnect':
        return (
          <Button onClick={handleReconnect} disabled={isLoading} size="sm" className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Reconnect
          </Button>
        )
      default:
        return null
    }
  }

  const renderLogo = () => {
    if (provider.logoUrl && !imageError) {
      return (
        <div className="relative w-10 h-10 rounded-md overflow-hidden bg-white border border-gray-200">
          <Image
            src={provider.logoUrl}
            alt={`${provider.name} logo`}
            fill
            className="object-contain p-1"
            onError={() => setImageError(true)}
          />
        </div>
      )
    }
    
    return (
      <div className={cn(
        "w-10 h-10 rounded-md flex items-center justify-center text-white font-semibold text-lg",
        getAvatarColor(provider.name)
      )}>
        {provider.name.charAt(0).toUpperCase()}
      </div>
    )
  }

  return (
    <Card className="flex flex-col justify-between h-full transition-all duration-200 hover:shadow-md rounded-lg border-gray-200">
      <CardHeader className="flex-row items-start justify-between p-4 pb-2">
        <div className="flex items-center gap-3">
          {renderLogo()}
          <div>
            <CardTitle className="text-base font-semibold text-gray-900">{provider.name}</CardTitle>
            {provider.description && (
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{provider.description}</p>
            )}
          </div>
        </div>
        <Badge 
          className={cn(
            "px-2.5 py-1 text-xs font-medium whitespace-nowrap",
            badgeClass
          )}
        >
          {statusText}
        </Badge>
      </CardHeader>
      <CardFooter className="p-4 pt-2">
        {renderButton()}
      </CardFooter>
    </Card>
  )
}
