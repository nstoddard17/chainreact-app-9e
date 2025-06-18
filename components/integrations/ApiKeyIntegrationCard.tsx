'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useIntegrationStore } from '@/stores/integrationStore'
import type { Provider, Integration } from '@/stores/integrationStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Link as LinkIcon, Link2Off, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GumroadGuide } from './guides/GumroadGuide'
import { ManyChatGuide } from './guides/ManyChatGuide'
import { BeehiivGuide } from './guides/BeehiivGuide'

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

interface ApiKeyIntegrationCardProps {
  provider: Provider
  integration: Integration | null
  status: 'connected' | 'expiring' | 'disconnected'
}

export function ApiKeyIntegrationCard({ provider, integration, status }: ApiKeyIntegrationCardProps) {
  const { connectApiKeyIntegration, disconnectIntegration, loadingStates } = useIntegrationStore()
  const [showGuide, setShowGuide] = useState(false)
  const [imageError, setImageError] = useState(false)

  const handleDisconnect = () => {
    if (integration) {
      disconnectIntegration(integration.id)
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
          action: 'disconnect'
        }
      default: // disconnected
        return {
          text: 'Disconnected',
          badgeClass: 'bg-gray-100 text-gray-800',
          action: 'connect'
        }
    }
  }

  const { text: statusText, badgeClass: statusBadgeClass, action: statusAction } = getStatusUi()

  const renderLogo = () => {
    if (provider.logoUrl) {
      return (
        <Image
          src={provider.logoUrl}
          alt={provider.name}
          width={40}
          height={40}
          className="object-contain"
        />
      )
    }
    // fallback avatar
    return (
      <span className={`flex items-center justify-center w-10 h-10 text-lg font-bold text-white bg-gray-400`}>
        {provider.name[0]}
      </span>
    )
  }

  const GuideComponent = {
    gumroad: GumroadGuide,
    manychat: ManyChatGuide,
    beehiiv: BeehiivGuide,
  }[provider.id as keyof typeof GuideComponent]

  return (
    <>
      <Card className="flex flex-col h-full transition-all duration-200 hover:shadow-lg rounded-xl border border-gray-200 bg-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-3 space-y-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {renderLogo()}
            <div className="min-w-0 flex-1">
              <h3 
                className="text-sm sm:text-base font-semibold text-gray-900 truncate"
                title={provider.name}
              >
                {provider.name}
              </h3>
              {provider.description && (
                <p className="text-xs sm:text-sm text-gray-500 truncate mt-0.5">
                  {provider.description}
                </p>
              )}
            </div>
          </div>
          <Badge 
            className={cn(
              "px-2 py-1 text-xs font-medium whitespace-nowrap shrink-0 ml-2",
              statusBadgeClass
            )}
          >
            {statusText}
          </Badge>
        </CardHeader>

        <CardContent className="px-4 pb-3 flex-1">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {integration?.created_at && (
              <span>Connected {new Date(integration.created_at).toLocaleDateString()}</span>
            )}
            {!integration && <span>API key required</span>}
            <span className="ml-auto text-gray-400">API Key</span>
          </div>
        </CardContent>

        <CardFooter className="p-4 pt-0">
          <div className="w-full">
            {statusAction === 'disconnect' ? (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  size="sm"
                  variant="outline"
                  className="flex-1 bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                >
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Disconnect
                </Button>
                <Button
                  onClick={() => setShowGuide(true)}
                  disabled={isLoading}
                  size="sm"
                  variant="ghost"
                  className="w-9 h-9 p-0 border border-gray-300 hover:bg-gray-50"
                  aria-label="Reconnect"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setShowGuide(true)}
                disabled={isLoading}
                size="sm"
                className="w-full bg-gray-900 text-white hover:bg-gray-800"
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                Connect
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
      {GuideComponent && (
        <GuideComponent
          open={showGuide}
          onOpenChange={setShowGuide}
          onConnect={(apiKey: any) => connectApiKeyIntegration(provider.id, apiKey)}
        />
      )}
    </>
  )
} 