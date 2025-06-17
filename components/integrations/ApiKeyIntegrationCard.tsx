'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useIntegrationStore } from '@/stores/integrationStore'
import type { Provider, Integration } from '@/stores/integrationStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, X, Link as LinkIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GumroadGuide } from './guides/GumroadGuide'
import { ManyChatGuide } from './guides/ManyChatGuide'
import { BeehiivGuide } from './guides/BeehiivGuide'

interface ApiKeyIntegrationCardProps {
  provider: Provider
  integration: Integration | null
}

const guideMap = {
  gumroad: GumroadGuide,
  manychat: ManyChatGuide,
  beehiiv: BeehiivGuide,
}

export function ApiKeyIntegrationCard({ provider, integration }: ApiKeyIntegrationCardProps) {
  const [showGuide, setShowGuide] = useState(false)
  const { connectApiKeyIntegration, disconnectIntegration, loadingStates } = useIntegrationStore()

  const isConnected = integration?.status === 'connected'
  const isLoadingConnect = loadingStates[`connect-${provider.id}`]
  const isLoadingDisconnect = integration ? loadingStates[`disconnect-${integration.provider}`] : false
  const isLoading = isLoadingConnect || isLoadingDisconnect

  const handleDisconnect = () => {
    if (integration) {
      disconnectIntegration(integration.id)
    }
  }

  const statusText = isConnected ? 'Connected' : 'Disconnected'
  const statusColor = 'text-gray-500'

  const GuideComponent = guideMap[provider.id as keyof typeof guideMap]

  const renderButton = () => {
    if (isConnected) {
      return (
        <Button
          onClick={handleDisconnect}
          disabled={isLoading}
          variant="outline"
          className="border-red-500 text-red-500 hover:bg-red-50 hover:text-red-600"
        >
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
          Disconnect
        </Button>
      )
    }
    return (
      <Button onClick={() => setShowGuide(true)} disabled={isLoading} className="bg-black text-white hover:bg-gray-800">
        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
        Connect
      </Button>
    )
  }

  return (
    <>
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            {provider.logoUrl && <Image src={provider.logoUrl} alt={`${provider.name} logo`} width={40} height={40} className="rounded-md" />}
            <div>
              <p className="text-lg font-bold text-gray-900">{provider.name}</p>
              <p className={cn('text-sm', statusColor)}>{statusText}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {renderButton()}
          </div>
        </CardContent>
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