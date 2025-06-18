'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useIntegrationStore } from '@/stores/integrationStore'
import type { Provider, Integration } from '@/stores/integrationStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Link as LinkIcon, Link2Off, RefreshCw, X } from 'lucide-react'
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
    // Enhanced fallback avatar with better styling
    const getAvatarColor = (name: string) => {
      const colors = [
        "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-pink-500",
        "bg-indigo-500", "bg-red-500", "bg-yellow-500", "bg-teal-500",
        "bg-orange-500", "bg-cyan-500", "bg-emerald-500", "bg-violet-500"
      ]
      const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      return colors[index % colors.length]
    }

    if (provider.logoUrl && !imageError) {
      return (
        <Image
          src={provider.logoUrl}
          alt={provider.name}
          width={48}
          height={48}
          className="object-contain"
          onError={() => setImageError(true)}
        />
      )
    }
    
    return (
      <div className={`flex items-center justify-center w-12 h-12 rounded-lg text-lg font-bold text-white ${getAvatarColor(provider.name)}`}>
        {provider.name.substring(0, 2).toUpperCase()}
      </div>
    )
  }

  const guideComponents = {
    gumroad: GumroadGuide,
    manychat: ManyChatGuide,
    beehiiv: BeehiivGuide,
  } as const

  const GuideComponent = guideComponents[provider.id as keyof typeof guideComponents]

  return (
    <>
      <Card className="flex flex-col h-full transition-all duration-200 hover:shadow-lg rounded-xl border border-gray-200 bg-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between p-5 pb-4 space-y-0">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {renderLogo()}
            <div className="min-w-0 flex-1">
              <h3 
                className="text-base sm:text-lg font-semibold text-gray-900 leading-tight"
                title={provider.name}
              >
                {provider.name === "Blackbaud Raiser's Edge NXT" ? "Blackbaud" : provider.name}
              </h3>
            </div>
          </div>
          <Badge 
            className={cn(
              "px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ml-3",
              statusBadgeClass
            )}
          >
            {statusText}
          </Badge>
        </CardHeader>

        <CardContent className="px-5 pb-4 flex-1">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {integration?.created_at && (
              <span>Connected {new Date(integration.created_at).toLocaleDateString()}</span>
            )}
            {!integration && <span>Not connected</span>}
          </div>
        </CardContent>

        <CardFooter className="p-5 pt-0">
          <div className="w-full">
            {status === 'connected' ? (
              <div className="flex items-center gap-3">
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
                  className="w-10 h-10 p-0 border border-gray-300 hover:bg-gray-50"
                  aria-label="Reconnect"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            ) : status === 'expiring' ? (
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setShowGuide(true)}
                  disabled={isLoading}
                  size="sm"
                  className="flex-1 bg-gray-900 text-white hover:bg-gray-800"
                >
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Reconnect
                </Button>
                <Button
                  onClick={handleDisconnect}
                  disabled={isLoading}
                  size="sm"
                  variant="outline"
                  className="w-10 h-10 p-0 border border-gray-300 hover:bg-gray-50"
                  aria-label="Disconnect"
                >
                  <X className="h-4 w-4" />
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