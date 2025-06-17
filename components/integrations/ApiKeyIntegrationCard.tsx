'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useIntegrationStore } from '@/stores/integrationStore'
import type { Provider, Integration } from '@/stores/integrationStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, X, Link as LinkIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GumroadGuide } from './guides/GumroadGuide'
import { ManyChatGuide } from './guides/ManyChatGuide'
import { BeehiivGuide } from './guides/BeehiivGuide'

interface ApiKeyIntegrationCardProps {
  provider: Provider
  integration: Integration | null
  status: 'connected' | 'expiring' | 'disconnected'
}

const guideMap = {
  gumroad: GumroadGuide,
  manychat: ManyChatGuide,
  beehiiv: BeehiivGuide,
}

export function ApiKeyIntegrationCard({ provider, integration, status }: ApiKeyIntegrationCardProps) {
  const [showGuide, setShowGuide] = useState(false)
  const { connectApiKeyIntegration, disconnectIntegration, loadingStates } = useIntegrationStore()

  const isLoading = 
    loadingStates[`connect-${provider.id}`] || 
    (integration ? loadingStates[`disconnect-${integration.provider}`] : false)


  const handleDisconnect = () => {
    if (integration) {
      disconnectIntegration(integration.id)
    }
  }

  const getStatusUi = () => {
    switch (status) {
      case 'connected':
        return {
          text: 'Connected',
          badgeClass: 'bg-green-100 text-green-800',
          action: 'disconnect'
        }
      // API key integrations don't expire, but handle for UI consistency
      case 'expiring':
        return {
          text: 'Check Key',
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
  
  const GuideComponent = guideMap[provider.id as keyof typeof guideMap]

  const renderButton = () => {
    if (statusAction === 'disconnect') {
      return (
        <Button
          onClick={handleDisconnect}
          disabled={isLoading}
          variant="destructive"
          size="sm"
          className="w-full"
        >
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
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

  return (
    <>
      <Card className="flex flex-col justify-between p-4 shadow-sm hover:shadow-md transition-shadow duration-200 rounded-lg border-gray-200">
          <CardHeader className="flex-row items-start justify-between p-2">
              <div className="flex items-center gap-4">
                {provider.logoUrl && <Image src={provider.logoUrl} alt={`${provider.name} logo`} width={40} height={40} className="rounded-md" />}
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