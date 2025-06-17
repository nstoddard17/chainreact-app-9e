'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useIntegrationStore } from '@/stores/integrationStore'
import type { Provider, Integration } from '@/stores/integrationStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, X } from 'lucide-react'
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

  const handleDisconnect = () => {
    if (integration) {
      disconnectIntegration(integration.id)
    }
  }

  const status = isConnected
    ? { text: 'Connected', color: 'bg-green-100 text-green-800' }
    : { text: 'Disconnected', color: 'bg-gray-200 text-gray-800' }

  const GuideComponent = guideMap[provider.id as keyof typeof guideMap]

  return (
    <>
      <Card className="flex flex-col justify-between p-4">
        <CardHeader className="flex flex-row items-center justify-between p-2">
          <div className="flex items-center gap-3">
            {provider.logoUrl && <Image src={provider.logoUrl} alt={`${provider.name} logo`} width={32} height={32} />}
            <CardTitle className="text-lg font-semibold">{provider.name}</CardTitle>
          </div>
          <Badge className={`px-2 py-1 text-xs font-medium rounded-full ${status.color}`}>{status.text}</Badge>
        </CardHeader>
        <CardContent className="p-2 flex-grow">
          {/* This space can be used for a short, consistent description if needed */}
        </CardContent>
        <CardFooter className="p-2">
          {isConnected ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={isLoadingDisconnect}
              className="w-full"
            >
              {isLoadingDisconnect ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
              Disconnect
            </Button>
          ) : (
            <Button onClick={() => setShowGuide(true)} disabled={isLoadingConnect} className="w-full">
              {isLoadingConnect && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Connect
            </Button>
          )}
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