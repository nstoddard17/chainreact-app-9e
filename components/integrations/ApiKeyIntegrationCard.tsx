'use client'

import { useState } from 'react'
import { useIntegrationStore } from '@/stores/integrationStore'
import type { Provider, Integration } from '@/stores/integrationStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import Image from 'next/image'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface ApiKeyIntegrationCardProps {
  provider: Provider
  integration: Integration | null
}

export function ApiKeyIntegrationCard({ provider, integration }: ApiKeyIntegrationCardProps) {
  const [apiKey, setApiKey] = useState('')
  const { connectApiKeyIntegration, disconnectIntegration, loadingStates, error } = useIntegrationStore()

  const isConnected = integration?.status === 'connected'
  const isLoadingConnect = loadingStates[`connect-${provider.id}`]
  const isLoadingDisconnect = integration ? loadingStates[`disconnect-${integration.provider}`] : false
  const isLoading = isLoadingConnect || isLoadingDisconnect

  const handleConnect = async () => {
    if (apiKey) {
      await connectApiKeyIntegration(provider.id, apiKey)
      // Clear key from input after submission for security
      setApiKey('')
    }
  }

  const handleDisconnect = () => {
    if (integration) {
      disconnectIntegration(integration.id)
    }
  }

  const providerError = error && error.toLowerCase().includes(provider.name.toLowerCase()) ? error : null

  return (
    <Card className="flex flex-col justify-between">
      <div>
        <CardHeader>
          <div className="flex items-start gap-4">
            <Image src={provider.logoUrl!} alt={`${provider.name} logo`} width={40} height={40} className="rounded-md" />
            <div className="flex-1">
              <CardTitle>{provider.name}</CardTitle>
              <CardDescription>{provider.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm font-medium text-green-700">Connected</p>
              <Button onClick={handleDisconnect} disabled={isLoading} variant="destructive" size="sm">
                {isLoadingDisconnect ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                type="password"
                placeholder="Enter your API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isLoadingConnect}
                className="font-mono"
              />
              <Button onClick={handleConnect} disabled={isLoadingConnect || !apiKey} className="w-full">
                {isLoadingConnect ? 'Connecting...' : 'Connect'}
              </Button>
            </div>
          )}
        </CardContent>
      </div>
      <CardFooter>
        {providerError && (
          <Alert variant="destructive" className="mt-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{providerError}</AlertDescription>
          </Alert>
        )}
      </CardFooter>
    </Card>
  )
} 