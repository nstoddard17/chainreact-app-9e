'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useIntegrationStore } from '@/stores/integrationStore'
import type { Provider, Integration } from '@/stores/integrationStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Link as LinkIcon, Link2Off } from 'lucide-react'
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
        return {
          text: 'Expiring',
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
          <CardHeader className="flex-row items-start justify-between p-2">
              <div className="flex items-center gap-4">
                {renderLogo()}
                <CardTitle className="text-lg font-semibold">{provider.name}</CardTitle>
              </div>
              <Badge className={cn("px-2.5 py-1 text-xs font-medium", statusBadgeClass)}>{statusText}</Badge>
          </CardHeader>
        <CardFooter className="p-2">
          {renderButton()}
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