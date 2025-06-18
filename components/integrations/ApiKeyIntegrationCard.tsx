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

  const renderButton = () => {
    if (statusAction === 'disconnect') {
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
    }
    return (
      <Button onClick={() => setShowGuide(true)} disabled={isLoading} size="sm" className="w-full">
        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
        Connect
      </Button>
    )
  }

  const GuideComponent = {
    gumroad: GumroadGuide,
    manychat: ManyChatGuide,
    beehiiv: BeehiivGuide,
  }[provider.id as keyof typeof GuideComponent]

  return (
    <>
      <Card className="flex flex-col justify-between p-4 shadow-sm hover:shadow-md transition-shadow duration-200 rounded-lg border-gray-200">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 p-3 sm:p-4 pb-1 sm:pb-2 relative">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-3 w-full">
            {renderLogo()}
            <div className="flex items-center w-full min-w-0">
              <span
                className="block text-base sm:text-base font-semibold text-gray-900 max-w-[180px] sm:max-w-[200px] truncate sm:whitespace-nowrap sm:overflow-hidden sm:text-ellipsis line-clamp-2 sm:line-clamp-1"
                title={provider.name}
              >
                {provider.name}
              </span>
            </div>
          </div>
          <Badge
            className={cn(
              "absolute right-4 top-4 px-2 py-0.5 text-xs font-medium whitespace-nowrap z-10",
              statusBadgeClass
            )}
          >
            {statusText}
          </Badge>
        </CardHeader>
        <CardFooter className="p-3 sm:p-4 pt-0 w-full">
          <div className="w-full flex flex-col gap-2">
            {statusAction === 'connected' ? (
              <>
                <Button onClick={() => setShowGuide(true)} disabled={isLoading} size="sm" className="w-full">
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Reconnect
                </Button>
                <Button onClick={handleDisconnect} disabled={isLoading} size="sm" variant="outline" className="w-fit self-end px-4">
                  Disconnect
                </Button>
              </>
            ) : (
              <Button onClick={() => setShowGuide(true)} disabled={isLoading} size="sm" className="w-full">
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
          onConnect={(apiKey) => connectApiKeyIntegration(provider.id, apiKey)}
        />
      )}
    </>
  )
} 